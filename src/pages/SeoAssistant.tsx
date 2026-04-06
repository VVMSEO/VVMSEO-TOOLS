import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Link } from 'react-router-dom';
import { 
  Loader2, 
  Copy, 
  CheckCircle, 
  FileText, 
  LayoutDashboard, 
  ListTodo, 
  History, 
  AlertCircle,
  Play,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

const SYSTEM_INSTRUCTION = `Ты — SEO-помощник для подготовки данных в рабочую таблицу проекта.

Твоя задача: принимать сырые заметки SEO-специалиста по проекту и превращать их в структурированные данные для заполнения таблицы проекта.

Работай только на русском языке.

Главный принцип:
Не переписывай заметки пользователя буквально. Преобразуй их в осмысленные SEO-блоки, пригодные для заполнения таблицы проекта, планирования работ и подготовки недельного отчёта.

Ты должен выдавать результат строго по следующему порядку блоков:

1. Паспорт проекта
2. Текущий спринт недели
3. Быстрая проверка приоритета
4. Очередь задач
5. Журнал действий и материал для отчёта

Требования к логике работы:

1. Сначала определи, есть ли в данных авария, просадка, проблемы индексации, непокрытый спрос, потенциал роста через CTR или задачи на качество.
2. Определи одно главное узкое место проекта.
3. Сформулируй один следующий шаг — конкретное действие, с которого SEO-специалист начнёт следующий заход в проект.
4. Если работа уже выполнена — занеси её в журнал действий и материал для отчёта.
5. Если работа только планируется — занеси её в текущий спринт недели или в очередь задач.
6. Если есть несколько мелких действий, объединяй их в один осмысленный SEO-блок, а не дроби на хаотичные микрооперации.
7. Не выдумывай данные. Если информации недостаточно, пиши: "нужно уточнение" или "недостаточно данных".

Определение статуса проекта:
- Красный — если есть авария, санкции, взлом, резкая просадка, критические ошибки, выпадение важных страниц, проблемы безопасности.
- Жёлтый — если проект работает, но есть узкое место, мешающее росту.
- Зелёный — если всё стабильно, идёт плановая работа.

Допустимые стадии проекта:
- Диагностика
- Стабилизация
- Индексация
- Структура
- On-page
- CTR и сниппет
- Поддержка

Допустимые слои работ:
- Техничка
- Индексация
- Структура
- On-page
- CTR
- Качество
- Поддержка

Допустимые приоритеты в спринте:
- A — авария
- B — блокер роста
- C — усилитель
- D — бэклог

В блоке "Очередь задач" используй следующие поля и логику оценки:
- Источник
- Задача
- Слой работ
- Влияние
- Срочность
- Зависимость
- Подтверждение данными
- Трудозатраты
- Приоритет
- Решение
- Когда брать
- Комментарий

Шкала оценки:
- 0 — низко
- 1 — средне
- 2 — высоко

Формула:
Приоритет = Влияние + Срочность + Зависимость + Подтверждение данными − Трудозатраты

Поле "Решение" должно принимать одно из значений:
- Брать в спринт
- Оставить в очереди
- Отложить в бэклог

В блоке "Текущий спринт недели" выводи не более 3 задач.

Правила формулировок:
- "Что сделали" пиши как законченный SEO-блок работ.
- "Зачем" пиши через SEO-цель.
- "Что проверить" пиши как конкретный измеримый контроль.
- "Строка для отчёта" должна быть почти готова для вставки клиенту без переработки.
- Не используй английские названия столбцов.
- Не пиши расплывчато вроде "улучшить SEO".
- Не дублируй одну и ту же информацию в разные блоки без причины.

Вопросы для блока "Быстрая проверка приоритета":
1. Есть ли авария / санкции / взлом / критическая ошибка?
2. Есть ли проблемы с индексацией важных страниц?
3. Есть ли просадка по кликам / показам / запросам?
4. Есть ли непокрытый спрос / нехватка посадочных?
5. Есть ли потенциал роста через CTR / сниппет?
6. Есть ли смысл в улучшениях качества / скорости / UX?

Ответ всегда возвращай только в JSON.
Без пояснений до JSON и после JSON.
Если поле неизвестно — заполняй строкой "нужно уточнение" или "недостаточно данных".`;

const DEFAULT_INPUT = `Заполни данные для SEO-таблицы по проекту на основе информации ниже.

Проект: 
Домен: 
Ниша: 
Регион: 
Бюджет: 
Главный KPI: 

Что уже сделано:
[сюда вставляю выполненные работы]

Что сейчас проверял / анализировал:
[сюда вставляю заметки по проверкам]

Что заметил:
[сюда вставляю проблемы, гипотезы, выводы]

Данные из сервисов:
Google Search Console:
[сюда вставляю данные]

Яндекс Вебмастер:
[сюда вставляю данные]

Метрика / Analytics:
[сюда вставляю данные]

Что нужно от результата:
- определить узкое место проекта
- предложить следующий шаг
- выделить до 3 задач в спринт
- всё выполненное перевести в журнал и материал для отчёта
- новые идеи и проблемы разложить в очередь задач

Дата обновления:
${new Date().toLocaleDateString('ru-RU')}`;

const SHORT_INPUT = `Проект: 
Домен: 
Дата: ${new Date().toLocaleDateString('ru-RU')}

Что сделал:
- 

Что нашёл:
- 

Что видно по данным:
- 

Что нужно от тебя:
- определить узкое место
- дать следующий шаг
- выделить до 3 задач недели
- оформить журнал
- разложить новые идеи в очередь задач`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    "паспорт_проекта": {
      type: Type.OBJECT,
      properties: {
        "проект": { type: Type.STRING },
        "домен": { type: Type.STRING },
        "ниша": { type: Type.STRING },
        "регион": { type: Type.STRING },
        "бюджет_руб_в_месяц": { type: Type.STRING },
        "главный_kpi": { type: Type.STRING },
        "статус_проекта": { type: Type.STRING },
        "стадия_проекта": { type: Type.STRING },
        "фокус_месяца": { type: Type.STRING },
        "узкое_место_проекта": { type: Type.STRING },
        "следующий_шаг": { type: Type.STRING },
        "дата_обновления": { type: Type.STRING }
      }
    },
    "текущий_спринт_недели": {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          "приоритет": { type: Type.STRING },
          "задача_недели": { type: Type.STRING },
          "зачем_делаем": { type: Type.STRING },
          "как_проверим_результат": { type: Type.STRING },
          "ответственный": { type: Type.STRING },
          "статус": { type: Type.STRING },
          "срок": { type: Type.STRING },
          "строка_для_отчета": { type: Type.STRING }
        }
      }
    },
    "быстрая_проверка_приоритета": {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          "вопрос": { type: Type.STRING },
          "ответ": { type: Type.STRING },
          "комментарий": { type: Type.STRING },
          "приоритет": { type: Type.STRING }
        }
      }
    },
    "очередь_задач": {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          "источник": { type: Type.STRING },
          "задача": { type: Type.STRING },
          "слой_работ": { type: Type.STRING },
          "влияние": { type: Type.NUMBER },
          "срочность": { type: Type.NUMBER },
          "зависимость": { type: Type.NUMBER },
          "подтверждение_данными": { type: Type.NUMBER },
          "трудозатраты": { type: Type.NUMBER },
          "приоритет": { type: Type.NUMBER },
          "решение": { type: Type.STRING },
          "когда_брать": { type: Type.STRING },
          "комментарий": { type: Type.STRING }
        }
      }
    },
    "журнал_действий_и_материал_для_отчета": {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          "дата": { type: Type.STRING },
          "что_сделали": { type: Type.STRING },
          "зачем": { type: Type.STRING },
          "что_проверить": { type: Type.STRING },
          "статус_эффекта": { type: Type.STRING },
          "строка_для_отчета": { type: Type.STRING },
          "следующая_проверка": { type: Type.STRING },
          "комментарий": { type: Type.STRING }
        }
      }
    }
  }
};

export default function SeoAssistant() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!input.trim()) {
      setError('Пожалуйста, введите данные по проекту.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: input,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.2,
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        setResult(parsed);
      } else {
        throw new Error('Пустой ответ от модели');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Произошла ошибка при генерации данных.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJson = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const setTemplate = (type: 'full' | 'short') => {
    setInput(type === 'full' ? DEFAULT_INPUT : SHORT_INPUT);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/" className="mr-2 text-slate-400 hover:text-slate-600 transition-colors" title="На главную">
              <ArrowLeft size={20} />
            </Link>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <LayoutDashboard size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">SEO Assistant Pro</h1>
          </div>
          {result && (
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              {copied ? 'Скопировано' : 'Копировать JSON'}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]">
        
        {/* Left Column: Input */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium flex items-center gap-2">
                <FileText size={18} className="text-blue-500" />
                Входные данные
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setTemplate('short')}
                  className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                >
                  Короткий
                </button>
                <button 
                  onClick={() => setTemplate('full')}
                  className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                >
                  Полный
                </button>
              </div>
            </div>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Вставьте ваши заметки здесь..."
            />

            <div className="mt-4">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Анализируем...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Сгенерировать данные
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-full overflow-y-auto pb-8 pr-2 custom-scrollbar">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-300">
              <LayoutDashboard size={48} className="mb-4 opacity-20" />
              <p className="text-sm">Заполните данные слева и нажмите "Сгенерировать"</p>
            </div>
          )}

          {loading && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-white/50 rounded-xl border border-slate-200">
              <RefreshCw size={32} className="animate-spin mb-4 text-blue-500" />
              <p className="text-sm font-medium animate-pulse">ИИ обрабатывает ваши заметки...</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              
              {/* 1. Паспорт проекта */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <LayoutDashboard size={18} className="text-indigo-500" />
                  <h3 className="font-semibold text-slate-800">1. Паспорт проекта</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <DataPoint label="Проект" value={result.паспорт_проекта.проект} />
                  <DataPoint label="Домен" value={result.паспорт_проекта.домен} />
                  <DataPoint label="Ниша" value={result.паспорт_проекта.ниша} />
                  <DataPoint label="Регион" value={result.паспорт_проекта.регион} />
                  <DataPoint label="Бюджет" value={result.паспорт_проекта.бюджет_руб_в_месяц} />
                  <DataPoint label="Дата обновления" value={result.паспорт_проекта.дата_обновления} />
                  
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <StatusBadge label="Статус" value={result.паспорт_проекта.статус_проекта} />
                    <StatusBadge label="Стадия" value={result.паспорт_проекта.стадия_проекта} />
                    <StatusBadge label="Главный KPI" value={result.паспорт_проекта.главный_kpi} />
                  </div>

                  <div className="col-span-full space-y-3 mt-2">
                    <HighlightBox label="Фокус месяца" value={result.паспорт_проекта.фокус_месяца} color="blue" />
                    <HighlightBox label="Узкое место проекта" value={result.паспорт_проекта.узкое_место_проекта} color="red" />
                    <HighlightBox label="Следующий шаг" value={result.паспорт_проекта.следующий_шаг} color="green" />
                  </div>
                </div>
              </section>

              {/* 2. Текущий спринт */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <ListTodo size={18} className="text-amber-500" />
                  <h3 className="font-semibold text-slate-800">2. Текущий спринт недели</h3>
                </div>
                <div className="p-0">
                  <div className="divide-y divide-slate-100">
                    {result.текущий_спринт_недели?.map((task: any, i: number) => (
                      <div key={i} className="p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-3 mb-2">
                          <span className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${getPriorityColor(task.приоритет)}`}>
                            {task.приоритет}
                          </span>
                          <h4 className="font-medium text-slate-900 mt-0.5">{task.задача_недели}</h4>
                        </div>
                        <div className="ml-9 space-y-2 text-sm">
                          <p><span className="text-slate-500">Зачем:</span> {task.зачем_делаем}</p>
                          <p><span className="text-slate-500">Проверка:</span> {task.как_проверим_результат}</p>
                          <div className="flex flex-wrap gap-3 pt-2">
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs">
                              Ответственный: {task.ответственный}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs">
                              Статус: {task.статус}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs">
                              Срок: {task.срок}
                            </span>
                          </div>
                          <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200 text-slate-700 italic">
                            "{task.строка_для_отчета}"
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!result.текущий_спринт_недели || result.текущий_спринт_недели.length === 0) && (
                      <div className="p-4 text-slate-500 text-sm text-center">Нет задач в спринте</div>
                    )}
                  </div>
                </div>
              </section>

              {/* 3. Быстрая проверка */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <AlertCircle size={18} className="text-rose-500" />
                  <h3 className="font-semibold text-slate-800">3. Быстрая проверка приоритета</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-medium">Вопрос</th>
                        <th className="px-4 py-3 font-medium w-24">Ответ</th>
                        <th className="px-4 py-3 font-medium">Комментарий</th>
                        <th className="px-4 py-3 font-medium w-24">Приоритет</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.быстрая_проверка_приоритета?.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-700">{item.вопрос}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              item.ответ.toLowerCase() === 'да' ? 'bg-rose-100 text-rose-700' : 
                              item.ответ.toLowerCase() === 'нет' ? 'bg-emerald-100 text-emerald-700' : 
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {item.ответ}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.комментарий}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              item.приоритет.toLowerCase() === 'высокий' ? 'bg-rose-100 text-rose-700' : 
                              item.приоритет.toLowerCase() === 'средний' ? 'bg-amber-100 text-amber-700' : 
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {item.приоритет}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 4. Очередь задач */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <ListTodo size={18} className="text-purple-500" />
                  <h3 className="font-semibold text-slate-800">4. Очередь задач</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-medium">Задача</th>
                        <th className="px-4 py-3 font-medium">Слой</th>
                        <th className="px-4 py-3 font-medium text-center" title="Влияние">Вл</th>
                        <th className="px-4 py-3 font-medium text-center" title="Срочность">Ср</th>
                        <th className="px-4 py-3 font-medium text-center" title="Зависимость">Зв</th>
                        <th className="px-4 py-3 font-medium text-center" title="Подтверждение данными">ПД</th>
                        <th className="px-4 py-3 font-medium text-center" title="Трудозатраты">ТЗ</th>
                        <th className="px-4 py-3 font-medium text-center bg-slate-100">Итог</th>
                        <th className="px-4 py-3 font-medium">Решение</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.очередь_задач?.map((task: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 truncate max-w-[200px]" title={task.задача}>{task.задача}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[200px]" title={task.источник}>{task.источник}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{task.слой_работ}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{task.влияние}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{task.срочность}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{task.зависимость}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{task.подтверждение_данными}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{task.трудозатраты}</td>
                          <td className="px-4 py-3 text-center font-bold bg-slate-50 text-slate-800">{task.приоритет}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              task.решение === 'Брать в спринт' ? 'bg-blue-100 text-blue-700' : 
                              task.решение === 'Оставить в очереди' ? 'bg-amber-100 text-amber-700' : 
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {task.решение}
                            </span>
                            <div className="text-xs text-slate-500 mt-1">{task.когда_брать}</div>
                          </td>
                        </tr>
                      ))}
                      {(!result.очередь_задач || result.очередь_задач.length === 0) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Очередь пуста</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 5. Журнал действий */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <History size={18} className="text-emerald-500" />
                  <h3 className="font-semibold text-slate-800">5. Журнал действий и материал для отчёта</h3>
                </div>
                <div className="p-0">
                  <div className="divide-y divide-slate-100">
                    {result.журнал_действий_и_материал_для_отчета?.map((log: any, i: number) => (
                      <div key={i} className="p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-slate-900">{log.что_сделали}</h4>
                          <span className="text-xs text-slate-500 whitespace-nowrap ml-4">{log.дата}</span>
                        </div>
                        <div className="space-y-2 text-sm mt-3">
                          <p><span className="text-slate-500">Зачем:</span> {log.зачем}</p>
                          <p><span className="text-slate-500">Что проверить:</span> {log.что_проверить}</p>
                          
                          <div className="flex flex-wrap gap-3 pt-2">
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs">
                              Эффект: {log.статус_эффекта}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs">
                              След. проверка: {log.следующая_проверка}
                            </span>
                          </div>
                          
                          <div className="mt-3 p-3 bg-emerald-50 rounded border border-emerald-100 text-emerald-800 italic">
                            "{log.строка_для_отчета}"
                          </div>
                          
                          {log.комментарий && log.комментарий !== 'нужно уточнение' && (
                            <p className="text-xs text-slate-500 mt-2">Примечание: {log.комментарий}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!result.журнал_действий_и_материал_для_отчета || result.журнал_действий_и_материал_для_отчета.length === 0) && (
                      <div className="p-4 text-slate-500 text-sm text-center">Нет записей в журнале</div>
                    )}
                  </div>
                </div>
              </section>

            </div>
          )}
        </div>
      </main>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
    </div>
  );
}

// UI Helper Components
const DataPoint = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs text-slate-500 mb-1">{label}</span>
    <span className="text-sm font-medium text-slate-800">{value || '—'}</span>
  </div>
);

const StatusBadge = ({ label, value }: { label: string, value: string }) => {
  let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
  
  if (value?.toLowerCase().includes('красный')) colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
  else if (value?.toLowerCase().includes('жёлтый') || value?.toLowerCase().includes('желтый')) colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
  else if (value?.toLowerCase().includes('зелёный') || value?.toLowerCase().includes('зеленый')) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <div className={`flex flex-col p-3 rounded-lg border ${colorClass}`}>
      <span className="text-xs opacity-80 mb-1">{label}</span>
      <span className="text-sm font-semibold">{value || '—'}</span>
    </div>
  );
};

const HighlightBox = ({ label, value, color }: { label: string, value: string, color: 'blue' | 'red' | 'green' }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    red: 'bg-rose-50 border-rose-100 text-rose-900',
    green: 'bg-emerald-50 border-emerald-100 text-emerald-900',
  };
  
  return (
    <div className={`p-3 rounded-lg border ${colors[color]}`}>
      <span className="text-xs font-semibold uppercase tracking-wider opacity-70 block mb-1">{label}</span>
      <span className="text-sm">{value || '—'}</span>
    </div>
  );
};

const getPriorityColor = (priority: string) => {
  switch (priority?.toUpperCase()) {
    case 'A': return 'bg-rose-100 text-rose-700';
    case 'B': return 'bg-amber-100 text-amber-700';
    case 'C': return 'bg-blue-100 text-blue-700';
    case 'D': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};
