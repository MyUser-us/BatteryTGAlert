
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

  const [battery, setBattery] = useState<BatteryStatus>({ level: 1, charging: false });
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [swReady, setSwReady] = useState<boolean | 'loading' | 'error' | 'not_supported' | 'dev_mode'>('loading');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockError, setWakeLockError] = useState(false);
  
  const sentThresholdsRef = useRef<Set<number>>(new Set());
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const checkSW = setInterval(() => {
      const status = (window as any).swStatus;
      if (status === 'active') {
        setSwReady(true);
        clearInterval(checkSW);
      } else if (status === 'dev_mode') {
        setSwReady('dev_mode');
        clearInterval(checkSW);
      } else if (status === 'error') {
        setSwReady('error');
        clearInterval(checkSW);
      } else if (status === 'not_supported') {
        setSwReady('not_supported');
        clearInterval(checkSW);
      }
    }, 1000);
    return () => clearInterval(checkSW);
  }, []);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        setWakeLockError(false);
      } catch (err: any) {
        setWakeLockActive(false);
        if (err.name === 'NotAllowedError' || err.message.includes('permission')) {
          setWakeLockError(true);
        }
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch (e) {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  useEffect(() => {
    if (isMonitoring) requestWakeLock();
    else releaseWakeLock();
    return () => releaseWakeLock();
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
        const message = `⚠️ *Разряд батареи*\n\n📱 Устройство: ${settings.phoneName}\n🔋 Уровень: ${percentage}%\n📉 Порог: ${t}%\n\nПожалуйста, подключите зарядное устройство!`;
        const success = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, message);
        
        setLogs(prev => [{
          id: Date.now().toString(),
          timestamp: new Date(),
          level: percentage,
          message: `Порог ${t}% достигнут.`,
          status: success ? 'sent' : 'failed'
        }, ...prev].slice(0, 50));
        
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
      });
    }
  }, [checkAndNotify]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-6 bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">
            Batt<span className="text-blue-500">Guard</span>
          </h1>
          <div className="flex items-center gap-3 mt-1">
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 {isMonitoring ? 'Active' : 'Standby'}
               </p>
             </div>
             <div className="h-2 w-px bg-slate-800"></div>
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${swReady === true ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 APK: {swReady === true ? 'Core OK' : 'Dev Mode'}
               </p>
             </div>
          </div>
        </div>
        <button 
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 ${
            isMonitoring ? 'bg-red-500/10 text-red-500 border border-red-500/50' : 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
      </header>

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <BatteryIndicator level={battery.level} isCharging={battery.charging} />
          
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Журнал событий</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar text-[11px]">
              {logs.length === 0 ? <p className="text-slate-700 text-center py-4">Событий пока нет</p> : logs.map(log => (
                <div key={log.id} className="flex justify-between items-center bg-slate-800/20 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">{log.timestamp.toLocaleTimeString()}</span>
                  <span className="font-bold">{log.message}</span>
                  <span className={log.status === 'sent' ? 'text-emerald-500' : 'text-red-500'}>{log.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-6">
            <h3 className="text-sm font-black mb-2 text-blue-400">ПОЧЕМУ ОТКРЫВАЕТСЯ GITHUB?</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
              Это происходит, если в PWABuilder вы указали ссылку на репозиторий кода, а не на сам сайт. 
            </p>
            <button onClick={() => setShowHelp(true)} className="w-full bg-blue-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              Как собрать APK правильно
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Настройки</h3>
            <input type="text" value={settings.phoneName} onChange={e => setSettings({...settings, phoneName: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm" placeholder="Имя устройства" />
            
            <div className="grid grid-cols-2 gap-4">
              <input type="number" value={settings.initialThreshold} onChange={e => setSettings({...settings, initialThreshold: Number(e.target.value)})}
                className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm" placeholder="Порог %" />
              <input type="number" value={settings.interval} onChange={e => setSettings({...settings, interval: Number(e.target.value)})}
                className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm" placeholder="Шаг %" />
            </div>

            <input type="password" placeholder="Telegram Bot Token" value={settings.telegramToken} onChange={e => setSettings({...settings, telegramToken: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-xs" />
            <input type="text" placeholder="Telegram Chat ID" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-xs" />
            
            <button onClick={async () => {
                const ok = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, "✅ Тест связи");
                alert(ok ? "Успешно!" : "Ошибка настроек");
              }} className="w-full bg-slate-800 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              Тест связи
            </button>
          </div>
        </section>
      </main>

      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black italic">APK GUIDE</h2>
              <button onClick={() => setShowHelp(false)} className="text-slate-500">✕</button>
            </div>
            <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
              <div className="bg-slate-950 p-5 rounded-2xl border border-blue-500/20">
                <p className="font-black text-blue-500 uppercase mb-2">Шаг 1: Публикация</p>
                <p>Выложите файлы на GitHub Pages (Settings -> Pages). Дождитесь, пока сайт станет доступен по адресу: <strong>https://username.github.io/repo/</strong></p>
              </div>
              <div className="bg-slate-950 p-5 rounded-2xl border border-emerald-500/20">
                <p className="font-black text-emerald-500 uppercase mb-2">Шаг 2: Сборка</p>
                <p>Зайдите на <strong>pwabuilder.com</strong> и вставьте ссылку именно на <strong>ВАШ САЙТ</strong>, а не на страницу кода GitHub.</p>
              </div>
              <div className="bg-slate-950 p-5 rounded-2xl border border-purple-500/20">
                <p className="font-black text-purple-500 uppercase mb-2">Шаг 3: Настройка Android</p>
                <p>После установки APK на телефоне: Настройки -> Приложения -> BattGuard -> Батарея -> <strong>Без ограничений</strong>.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full mt-8 bg-white text-black font-black py-4 rounded-2xl uppercase text-[10px]">Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
