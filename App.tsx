
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, BatteryStatus, NotificationLog } from './types';
import { sendTelegramMessage } from './services/telegramService';
import BatteryIndicator from './components/BatteryIndicator';

const STORAGE_KEY = 'battery_guardian_settings';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      phoneName: 'Android Device',
      telegramToken: '',
      telegramChatId: '',
      initialThreshold: 25,
      interval: 5,
      finalThreshold: 1
    };
  });

  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showStudioGuide, setShowStudioGuide] = useState(false);
  
  const sentThresholdsRef = useRef<Set<number>>(new Set());
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const toggleWakeLock = async (enable: boolean) => {
    if ('wakeLock' in navigator) {
      try {
        if (enable) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } else if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      } catch (err) {
        console.error('WakeLock failed:', err);
      }
    }
  };

  useEffect(() => {
    if (isMonitoring) toggleWakeLock(true);
    else toggleWakeLock(false);
    return () => { toggleWakeLock(false); };
  }, [isMonitoring]);

  const checkAndNotify = useCallback(async (level: number, charging: boolean) => {
    if (charging || !isMonitoring) {
      sentThresholdsRef.current.clear();
      return;
    }

    const percentage = Math.round(level * 100);
    const thresholds: number[] = [settings.finalThreshold];
    for (let t = settings.initialThreshold; t > settings.finalThreshold; t -= settings.interval) {
      thresholds.push(t);
    }
    thresholds.sort((a, b) => b - a);

    for (const t of thresholds) {
      if (percentage <= t && !sentThresholdsRef.current.has(t)) {
        const message = `⚠️ *Разряд*\n📱 ${settings.phoneName}\n🔋 Уровень: ${percentage}%`;
        const success = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, message);
        
        setLogs(prev => [{
          id: Date.now().toString(),
          timestamp: new Date(),
          level: percentage,
          message: `Порог ${t}% достигнут`,
          status: success ? 'sent' : 'failed'
        }, ...prev].slice(0, 15));
        
        sentThresholdsRef.current.add(t);
        break; 
      }
    }
  }, [settings, isMonitoring]);

  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(m => {
        const update = () => {
          setBattery({ level: m.level, charging: m.charging });
          checkAndNotify(m.level, m.charging);
        };
        update();
        m.addEventListener('levelchange', update);
        m.addEventListener('chargingchange', update);
      }).catch(err => {
        setError("Не удалось получить доступ к API батареи");
      });
    } else {
      setError("Ваш браузер/WebView не поддерживает Battery API");
    }
  }, [checkAndNotify]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl max-w-sm">
          <h2 className="text-red-500 font-black mb-4 uppercase italic">Критическая ошибка</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button onClick={() => location.reload()} className="w-full bg-slate-800 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">Повторить</button>
        </div>
      </div>
    );
  }

  if (!battery) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex flex-col items-center">
      <header className="w-full max-w-lg flex justify-between items-center mb-6 bg-slate-900/80 p-5 rounded-3xl border border-slate-800 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-black tracking-tighter uppercase italic text-blue-500">
            Batt<span className="text-white">Guard</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            {isMonitoring ? '● Monitoring On' : '○ Standby'}
          </p>
        </div>
        <button 
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-8 py-3 rounded-2xl font-black text-[11px] uppercase transition-all transform active:scale-90 ${
            isMonitoring ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'bg-blue-600 text-white shadow-xl shadow-blue-900/40'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
      </header>

      <main className="w-full max-w-lg space-y-5">
        <BatteryIndicator level={battery.level} isCharging={battery.charging} />
        
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Конфигурация</h3>
            <button onClick={() => setShowStudioGuide(true)} className="text-[10px] bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full font-bold border border-blue-500/20">
              Android Studio APK Guide
            </button>
          </div>

          <div className="space-y-3">
             <input type="text" value={settings.phoneName} placeholder="Device Name" onChange={e => setSettings({...settings, phoneName: e.target.value})}
               className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none transition-all" />
             
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-600 uppercase font-black ml-2">Начать с %</span>
                  <input type="number" value={settings.initialThreshold} onChange={e => setSettings({...settings, initialThreshold: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-600 uppercase font-black ml-2">Интервал %</span>
                  <input type="number" value={settings.interval} onChange={e => setSettings({...settings, interval: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none" />
                </div>
             </div>

             <div className="pt-2 border-t border-slate-800/50 space-y-3">
                <input type="password" placeholder="Telegram Bot Token" value={settings.telegramToken} onChange={e => setSettings({...settings, telegramToken: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-xs focus:border-blue-500 outline-none" />
                <input type="text" placeholder="Telegram Chat ID" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-xs focus:border-blue-500 outline-none" />
             </div>
          </div>

          <button onClick={async () => {
              const ok = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, "✅ Тест пройден!");
              alert(ok ? "Работает!" : "Ошибка! Проверьте Token/ID.");
            }} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors">
            Проверить Telegram
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Логи работы</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
            {logs.length === 0 ? (
              <p className="text-slate-700 text-center py-8 text-[10px] uppercase font-black">Событий нет</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-mono">{log.timestamp.toLocaleTimeString()}</span>
                  <span className="text-xs font-bold text-slate-300">{log.message}</span>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {log.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showStudioGuide && (
        <div className="fixed inset-0 bg-slate-950/98 z-50 overflow-y-auto p-6 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto space-y-8 pb-20">
            <div className="flex justify-between items-center sticky top-0 bg-slate-950/80 py-4 z-10 border-b border-slate-800 backdrop-blur-md">
              <h2 className="text-xl font-black italic">ANDROID STUDIO <span className="text-blue-500">BUILD</span></h2>
              <button onClick={() => setShowStudioGuide(false)} className="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold">✕</button>
            </div>

            <div className="space-y-6">
              <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
                <h4 className="text-blue-400 font-black text-xs uppercase mb-4 italic">Шаг 1: Подготовка Проекта</h4>
                <ul className="text-xs text-slate-400 space-y-3 list-decimal list-inside">
                  <li>Создайте в Android Studio новый проект: <b>Empty Views Activity</b>.</li>
                  <li>В <code className="text-emerald-400">AndroidManifest.xml</code> добавьте:
                    <pre className="bg-black p-3 mt-2 rounded-xl text-[10px] text-white">
{`<uses-permission android:name="android.permission.INTERNET" />`}</pre>
                  </li>
                </ul>
              </section>

              <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
                <h4 className="text-blue-400 font-black text-xs uppercase mb-4 italic">Шаг 2: Верстка (activity_main.xml)</h4>
                <pre className="bg-black p-4 rounded-xl text-[10px] text-white overflow-x-auto">
{`<WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />`}</pre>
              </section>

              <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
                <h4 className="text-blue-400 font-black text-xs uppercase mb-4 italic">Шаг 3: Код (MainActivity.java)</h4>
                <pre className="bg-black p-4 rounded-xl text-[10px] text-white overflow-x-auto">
{`WebView web = findViewById(R.id.webview);
web.getSettings().setJavaScriptEnabled(true);
web.getSettings().setDomStorageEnabled(true);
web.setWebViewClient(new WebViewClient());
// Вставьте вашу ссылку на GitHub Pages:
web.loadUrl("https://username.github.io/repo/");`}</pre>
              </section>

              <div className="bg-yellow-500/10 border border-yellow-500/20 p-5 rounded-2xl">
                <h4 className="text-yellow-500 font-black text-[10px] uppercase mb-2">Важно для фоновой работы:</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Чтобы приложение не засыпало, в настройках Android (на самом телефоне) нужно:
                  <br/>1. Отключить <b>Оптимизацию батареи</b> для вашего приложения.
                  <br/>2. Разрешить <b>Автозапуск</b> и <b>Фоновую активность</b>.
                </p>
              </div>
            </div>

            <button onClick={() => setShowStudioGuide(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase text-[11px] shadow-lg shadow-blue-900/40">
              Понятно, закрыть
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-8 opacity-20 text-[9px] font-black tracking-[0.5em] uppercase text-center">
        BattGuard Pro • Build Ready
      </footer>
    </div>
  );
};

export default App;
