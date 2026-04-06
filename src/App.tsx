import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  orderBy,
  deleteField
} from 'firebase/firestore';
import { Clock, Plus, Trash2, LogOut, Play, Pause, CheckCircle2, Edit2, Tag, X, Save, FolderPlus, Briefcase, Calendar, BarChart2, Bell, BellOff } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Category {
  id: string;
  name: string;
  createdAt: any;
}

interface Project {
  id: string;
  name: string;
  weeklyBudget?: number; // in minutes
  createdAt: any;
}

interface Task {
  id: string;
  projectId?: string;
  projectName?: string; // legacy
  taskName: string;
  plannedTime: number; // in minutes
  actualTime: number; // in minutes
  executionDate?: string; // YYYY-MM-DD
  createdAt: any;
  categoryId?: string;
  isRunning?: boolean;
  timerStartedAt?: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'stats'>('tasks');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      toast.success('Уведомления включены!');
    } else if (permission === 'denied') {
      toast.error('Уведомления заблокированы в браузере.');
    }
  };
  
  // Category management state
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  // Project management state
  const [showProjects, setShowProjects] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectBudget, setNewProjectBudget] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectBudget, setEditProjectBudget] = useState('');

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [plannedTimeInput, setPlannedTimeInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [executionDate, setExecutionDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editActualTimeInput, setEditActualTimeInput] = useState('');
  const [editTaskName, setEditTaskName] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editExecutionDate, setEditExecutionDate] = useState('');
  const [editPlannedTimeInput, setEditPlannedTimeInput] = useState('');

  // Time formatting helpers
  const applyTimeMask = (value: string) => {
    let cleaned = value.replace(/[^\d:]/g, '');
    const parts = cleaned.split(':');
    if (parts.length > 2) {
      cleaned = parts[0] + ':' + parts.slice(1).join('');
    }
    const hasColon = cleaned.includes(':');
    if (hasColon) {
      let [hours, minutes] = cleaned.split(':');
      if (minutes.length > 2) minutes = minutes.slice(0, 2);
      if (minutes.length === 2 && parseInt(minutes) > 59) minutes = '59';
      return `${hours}:${minutes}`;
    } else {
      if (cleaned.length > 2) {
        let hours = cleaned.slice(0, 2);
        let minutes = cleaned.slice(2, 4);
        if (minutes.length === 2 && parseInt(minutes) > 59) minutes = '59';
        return `${hours}:${minutes}`;
      }
      return cleaned;
    }
  };

  const parseTimeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(str => parseInt(str, 10) || 0);
    return (hours * 60) + (minutes || 0);
  };

  const formatMinutesToHHMM = (totalMinutes: number) => {
    if (isNaN(totalMinutes)) return '00:00';
    const hrs = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const mins = Math.floor(totalMinutes % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  // Timer tick state
  const [now, setNow] = useState(new Date());

  const getDisplayTimeSeconds = (task: Task) => {
    let elapsedSeconds = 0;
    if (task.isRunning && task.timerStartedAt) {
      const startedAt = task.timerStartedAt?.toDate?.() || now;
      elapsedSeconds = Math.max(0, (now.getTime() - startedAt.getTime()) / 1000);
    }
    return Math.floor((task.actualTime * 60) + elapsedSeconds);
  };

  const formatSecondsToHHMMSS = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setTasks([]);
      setCategories([]);
      return;
    }

    // Fetch Tasks
    const qTasks = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData: Task[] = [];
      snapshot.forEach((doc) => {
        tasksData.push({ id: doc.id, ...doc.data() } as Task);
      });
      setTasks(tasksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    // Fetch Categories
    const qCategories = query(
      collection(db, 'categories'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((doc) => {
        cats.push({ id: doc.id, ...doc.data() } as Category);
      });
      setCategories(cats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    // Fetch Projects
    const qProjects = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projs: Project[] = [];
      snapshot.forEach((doc) => {
        projs.push({ id: doc.id, ...doc.data() } as Project);
      });
      setProjects(projs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return () => {
      unsubscribeTasks();
      unsubscribeCategories();
      unsubscribeProjects();
    };
  }, [user, isAuthReady]);

  // Seed initial projects if empty
  useEffect(() => {
    if (isAuthReady && user && projects.length === 0 && localStorage.getItem('projectsSeeded') !== 'true') {
      const seedProjects = async () => {
        const initialProjects = [
          { name: 'exterier.ru', budget: 3 * 60 + 18 },
          { name: 'prompb.ru', budget: 2 * 60 + 42 },
          { name: 'luxaria.ru', budget: 2 * 60 + 0 },
          { name: 'wexpresskargo.ru', budget: 2 * 60 + 54 },
          { name: 'jazzmoto.ru', budget: 2 * 60 + 30 },
          { name: 'pulsar-nn.com', budget: 2 * 60 + 12 },
          { name: 'medwellness.ru', budget: 2 * 60 + 12 },
          { name: 'kovry-karat.ru', budget: 2 * 60 + 12 },
          { name: 'extrememoto.ru', budget: 2 * 60 + 12 },
          { name: 'топбухгалтер.рф', budget: 1 * 60 + 36 },
          { name: 'rossgr.ru', budget: 1 * 60 + 6 },
          { name: 'souzholod.ru', budget: 1 * 60 + 6 }
        ];
        try {
          for (const proj of initialProjects) {
            await addDoc(collection(db, 'projects'), {
              userId: user.uid,
              name: proj.name,
              weeklyBudget: proj.budget,
              createdAt: serverTimestamp()
            });
          }
          localStorage.setItem('projectsSeeded', 'true');
        } catch (error) {
          console.error("Failed to seed projects", error);
        }
      };
      seedProjects();
    }
  }, [isAuthReady, user, projects.length]);

  // Tick every 1 second to update running timers
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const notifiedTasks = React.useRef<Set<string>>(new Set());
  const notifiedNearExpiration = React.useRef<Set<string>>(new Set());
  const notifiedWeeklyBudgets = React.useRef<Set<string>>(new Set());

  // Function to play a notification sound using Web Audio API
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio notification failed", e);
    }
  };

  // Initialize notified tasks on first load so we don't spam on refresh
  useEffect(() => {
    tasks.forEach(task => {
      const totalSeconds = getDisplayTimeSeconds(task);
      const plannedSeconds = task.plannedTime * 60;
      if (plannedSeconds > 0 && totalSeconds > plannedSeconds) {
        notifiedTasks.current.add(task.id);
      }
    });

    // Also check weekly budgets
    const stats = calculateStats();
    stats.forEach(stat => {
      if (stat.budget > 0 && stat.week >= stat.budget) {
        notifiedWeeklyBudgets.current.add(stat.projectId);
      }
    });
  }, [tasks, projects]);

  useEffect(() => {
    let runningTask = tasks.find(t => t.isRunning);
    
    if (runningTask) {
      const totalSeconds = getDisplayTimeSeconds(runningTask);
      const project = projects.find(p => p.id === runningTask.projectId);
      const projName = project?.name || runningTask.projectName;
      
      const plannedSeconds = runningTask.plannedTime * 60;
      const isTaskOvertime = plannedSeconds > 0 && totalSeconds > plannedSeconds;
      const remainingSeconds = plannedSeconds - totalSeconds;
      
      // Update document title with overtime indicator
      const timeStr = formatSecondsToHHMMSS(totalSeconds);
      if (isTaskOvertime) {
        document.title = `⚠️ ${timeStr} - ${projName || 'Задача'}`;
      } else {
        document.title = `${timeStr} - ${projName || 'Задача'}`;
      }

      // 0. Near Expiration Notification (5 minutes left)
      if (plannedSeconds > 0 && remainingSeconds > 0 && remainingSeconds <= 300 && !notifiedNearExpiration.current.has(runningTask.id)) {
        toast.info(`Осталось 5 минут!`, {
          description: `Время задачи "${runningTask.taskName}" почти истекло.`,
          duration: 10000,
        });
        playNotificationSound();
        
        if (notificationPermission === 'granted') {
          new Notification(`Осталось 5 минут: ${runningTask.taskName}`, {
            body: `Запланированное время почти истекло в проекте ${projName || 'Неизвестно'}.`,
            icon: '/favicon.ico'
          });
        }
        
        notifiedNearExpiration.current.add(runningTask.id);
      }
      
      // 1. Task Overtime Notification
      if (isTaskOvertime && !notifiedTasks.current.has(runningTask.id)) {
        toast.error(`Время задачи вышло!`, {
          description: `Задача "${runningTask.taskName}" в проекте "${projName || 'Неизвестно'}" превысила запланированное время.`,
          duration: 15000,
        });
        
        playNotificationSound();
        
        if (notificationPermission === 'granted') {
          new Notification(`Время истекло: ${runningTask.taskName}`, {
            body: 'Начался учет переработки.',
            icon: '/favicon.ico'
          });
        }
        
        notifiedTasks.current.add(runningTask.id);
      }

      // 2. Weekly Budget Notification
      if (project && project.weeklyBudget > 0 && !notifiedWeeklyBudgets.current.has(project.id)) {
        const stats = calculateStats();
        const projectStat = stats.find(s => s.projectId === project.id);
        
        if (projectStat && projectStat.week >= project.weeklyBudget) {
          toast.warning(`Недельный бюджет исчерпан!`, {
            description: `Проект "${project.name}" превысил установленный недельный бюджет (${formatMinutesToHHMM(project.weeklyBudget)}).`,
            duration: 20000,
          });
          
          playNotificationSound();
          
          if (notificationPermission === 'granted') {
            new Notification(`Бюджет исчерпан: ${project.name}`, {
              body: `Недельный бюджет проекта (${formatMinutesToHHMM(project.weeklyBudget)}) полностью использован.`,
              icon: '/favicon.ico'
            });
          }
          
          notifiedWeeklyBudgets.current.add(project.id);
        }
      }
    } else {
      document.title = 'Трекер Времени';
    }
  }, [now, tasks, projects]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // --- Category Handlers ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'categories'), {
        userId: user.uid,
        name: newCategoryName.trim(),
        createdAt: serverTimestamp()
      });
      setNewCategoryName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
      if (selectedCategoryId === id) setSelectedCategoryId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
    }
  };

  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditCategoryName(cat.name);
  };

  const saveCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', id), { name: editCategoryName.trim() });
      setEditingCategoryId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  // --- Project Handlers ---
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        name: newProjectName.trim(),
        weeklyBudget: parseTimeToMinutes(newProjectBudget),
        createdAt: serverTimestamp()
      });
      setNewProjectName('');
      setNewProjectBudget('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (selectedProjectId === id) setSelectedProjectId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const startEditProject = (proj: Project) => {
    setEditingProjectId(proj.id);
    setEditProjectName(proj.name);
    setEditProjectBudget(formatMinutesToHHMM(proj.weeklyBudget || 0));
  };

  const saveProject = async (id: string) => {
    if (!editProjectName.trim()) return;
    try {
      await updateDoc(doc(db, 'projects', id), {
        name: editProjectName.trim(),
        weeklyBudget: parseTimeToMinutes(editProjectBudget)
      });
      setEditingProjectId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  // --- Task Handlers ---
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProjectId || !taskName.trim() || !plannedTimeInput) return;

    const plannedMinutes = parseTimeToMinutes(plannedTimeInput);
    const actualMinutes = 0;

    if (plannedMinutes <= 0) {
      alert("Пожалуйста, введите корректное время (больше 0).");
      return;
    }

    const taskData: any = {
      userId: user.uid,
      projectId: selectedProjectId,
      taskName: taskName.trim(),
      plannedTime: plannedMinutes,
      actualTime: actualMinutes,
      executionDate: executionDate || format(new Date(), 'yyyy-MM-dd'),
      createdAt: serverTimestamp(),
      isRunning: false
    };

    if (selectedCategoryId) {
      taskData.categoryId = selectedCategoryId;
    }

    try {
      await addDoc(collection(db, 'tasks'), taskData);
      setTaskName('');
      setPlannedTimeInput('');
      setSelectedCategoryId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditActualTimeInput(formatMinutesToHHMM(getDisplayTimeSeconds(task) / 60));
    setEditTaskName(task.taskName);
    setEditProjectId(task.projectId || '');
    setEditCategoryId(task.categoryId || '');
    setEditExecutionDate(task.executionDate || format(new Date(), 'yyyy-MM-dd'));
    setEditPlannedTimeInput(formatMinutesToHHMM(task.plannedTime));
  };

  const saveTask = async (taskId: string) => {
    const actualMinutes = parseTimeToMinutes(editActualTimeInput);
    const plannedMinutes = parseTimeToMinutes(editPlannedTimeInput);
    
    if (actualMinutes < 0 || plannedMinutes <= 0 || !editTaskName.trim() || !editProjectId) {
      alert("Пожалуйста, заполните все обязательные поля корректно.");
      return;
    }

    try {
      const updateData: any = {
        taskName: editTaskName.trim(),
        projectId: editProjectId,
        executionDate: editExecutionDate,
        plannedTime: plannedMinutes,
        actualTime: actualMinutes,
      };

      if (editCategoryId) {
        updateData.categoryId = editCategoryId;
      } else {
        updateData.categoryId = deleteField();
      }

      // If actual time was manually changed, stop the timer
      const task = tasks.find(t => t.id === taskId);
      if (task && task.isRunning && actualMinutes !== Math.floor(getDisplayTimeSeconds(task) / 60)) {
        updateData.isRunning = false;
        updateData.timerStartedAt = deleteField();
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);
      setEditingTaskId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const toggleTimer = async (task: Task) => {
    if (!task.isRunning) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    try {
      if (task.isRunning) {
        // Stop timer
        const startedAt = task.timerStartedAt?.toDate?.() || new Date();
        const elapsedMinutes = (new Date().getTime() - startedAt.getTime()) / 60000;
        const newActualTime = Math.max(0, task.actualTime + elapsedMinutes);

        await updateDoc(doc(db, 'tasks', task.id), {
          isRunning: false,
          timerStartedAt: deleteField(),
          actualTime: newActualTime
        });
      } else {
        // Start timer
        await updateDoc(doc(db, 'tasks', task.id), {
          isRunning: true,
          timerStartedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const formatTime = (minutes: number) => {
    const totalMins = Math.floor(minutes);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0 && mins > 0) return `${hrs} ч ${mins} мин`;
    if (hrs > 0) return `${hrs} ч`;
    return `${mins} мин`;
  };

  const calculateStats = () => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const stats: Record<string, { week: number, month: number, name: string, budget: number, projectId: string }> = {};

    projects.forEach(p => {
      stats[p.id] = { week: 0, month: 0, name: p.name, budget: p.weeklyBudget || 0, projectId: p.id };
    });

    tasks.forEach(task => {
      const pId = task.projectId;
      if (!pId || !stats[pId]) return;

      const dateStr = task.executionDate;
      if (!dateStr) return;

      const date = parseISO(dateStr);
      const actualMins = Math.floor(getDisplayTimeSeconds(task) / 60);

      if (isWithinInterval(date, { start: weekStart, end: weekEnd })) {
        stats[pId].week += actualMins;
      }
      if (isWithinInterval(date, { start: monthStart, end: monthEnd })) {
        stats[pId].month += actualMins;
      }
    });

    return Object.values(stats).filter(s => s.week > 0 || s.month > 0 || s.budget > 0).sort((a, b) => b.month - a.month);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg text-center">
          <div className="flex justify-center">
            <div className="bg-indigo-100 p-3 rounded-full">
              <Clock className="h-10 w-10 text-indigo-600" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Трекер Времени
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Управляйте проектами и отслеживайте затраченное время
          </p>
          <button
            onClick={handleLogin}
            className="mt-8 w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Войти через Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-indigo-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Трекер Времени</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowProjects(!showProjects)}
                className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md transition-colors ${
                  showProjects 
                    ? 'border-indigo-500 text-indigo-700 bg-indigo-50' 
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Проекты
              </button>
              <button
                onClick={() => setShowCategories(!showCategories)}
                className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md transition-colors ${
                  showCategories 
                    ? 'border-indigo-500 text-indigo-700 bg-indigo-50' 
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Категории
              </button>
              
              {/* Notification Toggle */}
              <button
                onClick={requestNotificationPermission}
                className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${
                  notificationPermission === 'granted' ? 'text-green-600' : notificationPermission === 'denied' ? 'text-red-600' : ''
                }`}
                title={notificationPermission === 'granted' ? 'Уведомления включены' : 'Включить уведомления'}
              >
                {notificationPermission === 'granted' ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
              </button>

              <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Выйти
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Tabs */}
        <div className="mb-8 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`${
                activeTab === 'tasks'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <Clock className="h-5 w-5 mr-2" />
              Задачи
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`${
                activeTab === 'stats'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <BarChart2 className="h-5 w-5 mr-2" />
              Статистика
            </button>
          </nav>
        </div>

        {/* Project Management */}
        {showProjects && (
          <div className="bg-white shadow rounded-lg mb-8 p-6 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Управление проектами</h3>
              <button onClick={() => setShowProjects(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddProject} className="flex gap-4 mb-6">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Название нового проекта..."
                className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <input
                type="text"
                value={newProjectBudget}
                onChange={(e) => setNewProjectBudget(applyTimeMask(e.target.value))}
                placeholder="Бюджет (ЧЧ:ММ)"
                className="w-32 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-center"
              />
              <button type="submit" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <Plus className="h-4 w-4 mr-2" /> Добавить
              </button>
            </form>
            <ul className="divide-y divide-gray-200">
              {projects.map(proj => (
                <li key={proj.id} className="py-3 flex justify-between items-center">
                  {editingProjectId === proj.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <input
                        type="text"
                        value={editProjectName}
                        onChange={(e) => setEditProjectName(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editProjectBudget}
                        onChange={(e) => setEditProjectBudget(applyTimeMask(e.target.value))}
                        placeholder="ЧЧ:ММ"
                        className="w-20 border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-center"
                      />
                      <button onClick={() => saveProject(proj.id)} className="text-green-600 hover:text-green-900 bg-green-50 p-1.5 rounded-md">
                        <Save className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingProjectId(null)} className="text-gray-500 hover:text-gray-700 bg-gray-100 p-1.5 rounded-md">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{proj.name}</span>
                        {proj.weeklyBudget ? (
                          <span className="text-xs text-gray-500">Бюджет: {formatTime(proj.weeklyBudget)}/нед</span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEditProject(proj)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDeleteProject(proj.id)} className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-md">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {projects.length === 0 && (
                <li className="py-4 text-sm text-gray-500 text-center">Нет созданных проектов</li>
              )}
            </ul>
          </div>
        )}

        {/* Category Management */}
        {showCategories && (
          <div className="bg-white shadow rounded-lg mb-8 p-6 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Управление категориями</h3>
              <button onClick={() => setShowCategories(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="flex gap-4 mb-6">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Название новой категории..."
                className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <button type="submit" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <Plus className="h-4 w-4 mr-2" /> Добавить
              </button>
            </form>
            <ul className="divide-y divide-gray-200">
              {categories.map(cat => (
                <li key={cat.id} className="py-3 flex justify-between items-center">
                  {editingCategoryId === cat.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <input
                        type="text"
                        value={editCategoryName}
                        onChange={(e) => setEditCategoryName(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button onClick={() => saveCategory(cat.id)} className="text-green-600 hover:text-green-900 bg-green-50 p-1.5 rounded-md">
                        <Save className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingCategoryId(null)} className="text-gray-500 hover:text-gray-700 bg-gray-100 p-1.5 rounded-md">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                      <div className="flex gap-2">
                        <button onClick={() => startEditCategory(cat)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-md">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {categories.length === 0 && (
                <li className="py-4 text-sm text-gray-500 text-center">Нет созданных категорий</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'tasks' ? (
          <>
            {/* Add Task Form */}
            <div className="bg-white shadow rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Добавить новую задачу
                </h3>
                <form onSubmit={handleAddTask} className="grid grid-cols-1 gap-y-6 sm:grid-cols-6 sm:gap-x-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="project" className="block text-sm font-medium text-gray-700">
                      Проект
                    </label>
                    <select
                      id="project"
                      required
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Выберите проект</option>
                      {projects.map(proj => (
                        <option key={proj.id} value={proj.id}>{proj.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="task" className="block text-sm font-medium text-gray-700">
                      Задача
                    </label>
                    <input
                      type="text"
                      id="task"
                      required
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Описание задачи"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                      Категория
                    </label>
                    <select
                      id="category"
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Без категории</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="executionDate" className="block text-sm font-medium text-gray-700">
                      Дата
                    </label>
                    <input
                      type="date"
                      id="executionDate"
                      required
                      value={executionDate}
                      onChange={(e) => setExecutionDate(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="planned" className="block text-sm font-medium text-gray-700">
                      План (ЧЧ:ММ)
                    </label>
                    <input
                      type="text"
                      id="planned"
                      required
                      value={plannedTimeInput}
                      onChange={(e) => setPlannedTimeInput(applyTimeMask(e.target.value))}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="00:00"
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="submit"
                      className="w-full inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                    >
                      <Plus className="h-5 w-5 mr-1" />
                      Добавить
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {tasks.length === 0 ? (
              <li className="px-4 py-12 text-center text-gray-500">
                Нет задач. Добавьте первую задачу выше!
              </li>
            ) : (
              tasks.map((task) => {
                const displaySeconds = getDisplayTimeSeconds(task);
                const plannedSeconds = task.plannedTime * 60;
                const isOvertime = plannedSeconds > 0 && displaySeconds > plannedSeconds;
                const overtimeSeconds = isOvertime ? displaySeconds - plannedSeconds : 0;
                const cat = categories.find(c => c.id === task.categoryId);
                
                return (
                  <li key={task.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors">
                    {editingTaskId === task.id ? (
                      <div className="flex flex-col gap-4 w-full">
                        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-6 sm:gap-x-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Проект</label>
                            <select
                              value={editProjectId}
                              onChange={(e) => setEditProjectId(e.target.value)}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                              <option value="">Выберите проект</option>
                              {projects.map(proj => (
                                <option key={proj.id} value={proj.id}>{proj.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Задача</label>
                            <input
                              type="text"
                              value={editTaskName}
                              onChange={(e) => setEditTaskName(e.target.value)}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              placeholder="Описание задачи"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Категория</label>
                            <select
                              value={editCategoryId}
                              onChange={(e) => setEditCategoryId(e.target.value)}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                              <option value="">Без категории</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Дата</label>
                            <input
                              type="date"
                              value={editExecutionDate}
                              onChange={(e) => setEditExecutionDate(e.target.value)}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">План (ЧЧ:ММ)</label>
                            <input
                              type="text"
                              value={editPlannedTimeInput}
                              onChange={(e) => setEditPlannedTimeInput(applyTimeMask(e.target.value))}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              placeholder="00:00"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Факт (ЧЧ:ММ)</label>
                            <input
                              type="text"
                              value={editActualTimeInput}
                              onChange={(e) => setEditActualTimeInput(applyTimeMask(e.target.value))}
                              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              placeholder="00:00"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-2">
                          <button
                            onClick={() => setEditingTaskId(null)}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <X className="h-4 w-4 mr-1.5" /> Отмена
                          </button>
                          <button
                            onClick={() => saveTask(task.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <Save className="h-4 w-4 mr-1.5" /> Сохранить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-3 mb-1">
                              <p className="text-sm font-medium text-indigo-600 truncate">
                                {task.projectId ? projects.find(p => p.id === task.projectId)?.name : task.projectName}
                              </p>
                              {cat && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                  <Tag className="mr-1 h-3 w-3" />
                                  {cat.name}
                                </span>
                              )}
                              {task.executionDate && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                  <Calendar className="mr-1 h-3 w-3" />
                                  {format(parseISO(task.executionDate), 'dd.MM.yyyy')}
                                </span>
                              )}
                            </div>
                            <p className="text-base font-semibold text-gray-900 truncate mb-2">
                              {task.taskName}
                            </p>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                              <div className="flex items-center">
                                <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                План: {formatTime(task.plannedTime)}
                              </div>
                              <div className={`flex items-center ${task.isRunning ? 'text-indigo-600 font-medium' : ''}`}>
                                <CheckCircle2 className={`flex-shrink-0 mr-1.5 h-4 w-4 ${task.isRunning ? 'text-indigo-600 animate-pulse' : (isOvertime ? 'text-red-500' : 'text-green-500')}`} />
                                Факт: {formatSecondsToHHMMSS(displaySeconds)}
                              </div>
                              {isOvertime && (
                                <div className="flex items-center text-red-600 font-medium">
                                  <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-red-500" />
                                  Переработка: {formatSecondsToHHMMSS(overtimeSeconds)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            {/* Timer Button */}
                            <button
                              onClick={() => toggleTimer(task)}
                              className={`p-2 rounded-full transition-colors shadow-sm ${
                                task.isRunning 
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 ring-2 ring-amber-400 ring-offset-1' 
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={task.isRunning ? "Остановить таймер" : "Запустить таймер"}
                            >
                              {task.isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                            </button>

                            <div className="h-8 w-px bg-gray-300 mx-2"></div>

                            <button
                              onClick={() => startEditing(task)}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md transition-colors"
                              title="Изменить задачу"
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-md transition-colors"
                              title="Удалить задачу"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${isOvertime ? 'bg-red-500' : (task.isRunning ? 'bg-indigo-500' : 'bg-green-500')}`}
                            style={{ width: `${Math.min(100, plannedSeconds > 0 ? (displaySeconds / plannedSeconds) * 100 : 0)}%` }}
                          ></div>
                        </div>
                      </>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
          </>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
              Статистика по проектам
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Проект
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Бюджет (в неделю)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Факт (за неделю)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Недоработка / Переработка
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Факт (за месяц)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    const stats = calculateStats();
                    if (stats.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                            Нет данных для отображения
                          </td>
                        </tr>
                      );
                    }
                    return stats.map((stat, idx) => {
                      const diff = stat.budget > 0 ? stat.budget - stat.week : 0;
                      const isUndertime = diff > 0;
                      const isOvertime = diff < 0;
                      
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {stat.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {stat.budget > 0 ? formatTime(stat.budget) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatTime(stat.week)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {stat.budget > 0 ? (
                              isUndertime ? (
                                <span className="text-amber-600 font-medium">Недоработка: {formatTime(diff)}</span>
                              ) : isOvertime ? (
                                <span className="text-red-600 font-medium">Переработка: {formatTime(Math.abs(diff))}</span>
                              ) : (
                                <span className="text-green-600 font-medium">В норме</span>
                              )
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatTime(stat.month)}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
