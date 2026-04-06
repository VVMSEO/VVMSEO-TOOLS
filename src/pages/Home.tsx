import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, BarChart, Settings, Wrench, Clock } from 'lucide-react';

export default function Home() {
  const tools = [
    {
      id: 'seo-assistant',
      name: 'SEO Assistant Pro',
      description: 'Превращает сырые заметки в структурированные данные для таблицы проекта.',
      icon: <FileText size={24} className="text-blue-500" />,
      path: '/seo-assistant',
      status: 'Активен',
      color: 'bg-blue-50 border-blue-200',
      isExternal: false
    },
    {
      id: 'time-tracker',
      name: 'Трекер времени',
      description: 'Ваш текущий инструмент для учета рабочего времени.',
      icon: <Clock size={24} className="text-orange-500" />,
      path: 'project-time-tracker/',
      status: 'Активен',
      color: 'bg-orange-50 border-orange-200',
      isExternal: true
    },
    {
      id: 'text-analyzer',
      name: 'Анализатор текста',
      description: 'Проверка плотности ключевых слов, воды и спама в текстах.',
      icon: <Search size={24} className="text-emerald-500" />,
      path: '/',
      status: 'В разработке',
      color: 'bg-slate-50 border-slate-200 opacity-60',
      isExternal: false
    },
    {
      id: 'keyword-grouper',
      name: 'Группиратор запросов',
      description: 'Кластеризация семантического ядра на основе выдачи.',
      icon: <BarChart size={24} className="text-purple-500" />,
      path: '/',
      status: 'В разработке',
      color: 'bg-slate-50 border-slate-200 opacity-60',
      isExternal: false
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-white">
              <Wrench size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">VVMSEO TOOLS</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 mt-8">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Добро пожаловать</h2>
          <p className="text-slate-600">Единый портал для всех ваших SEO-инструментов.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map(tool => {
            const CardContent = (
              <>
                <div className="bg-white w-12 h-12 rounded-lg shadow-sm flex items-center justify-center mb-4">
                  {tool.icon}
                </div>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">{tool.name}</h2>
                <p className="text-sm text-slate-600 mb-4 h-10">{tool.description}</p>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tool.status === 'Активен' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                  {tool.status}
                </span>
              </>
            );

            const className = `block p-6 rounded-xl border transition-all hover:shadow-md ${tool.color} ${tool.status === 'В разработке' ? 'cursor-default pointer-events-none' : 'hover:-translate-y-1'}`;

            return tool.isExternal ? (
              <a key={tool.id} href={tool.path} className={className}>
                {CardContent}
              </a>
            ) : (
              <Link key={tool.id} to={tool.path} className={className}>
                {CardContent}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
