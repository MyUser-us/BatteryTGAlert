
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
  const [swError, setSwError] = useState<string>('');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockError, setWakeLockError] = useState(false);
  
  const sentThresholdsRef = useRef<Set<number>>(new Set());
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Monitor Service Worker Status
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
        setSwError((window as any).swErrorMessage || 'Unknown Error');
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
        // Проверяем, не заблокировано ли это политикой разрешений (как в превью)
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        setWakeLockError(false);
      } catch (err: any) {
        console.warn('WakeLock недоступен в этом окружении:', err.message);
        setWakeLockActive(false);
        if (err.name === 'NotAllowedError' || err.message.includes('permission')) {
          setWakeLockError(true);
        }
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch (e) {}
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
    let batteryManager: any = null;
    const update = (m: any) => {
      setBattery({ level: m.level, charging: m.charging });
      checkAndNotify(m.level, m.charging);
    };

    if ('getBattery' in navigator) {
      navigator.getBattery().then(m => {
        batteryManager = m;
        update(m);
        m.addEventListener('levelchange', () => update(m));
        m.addEventListener('chargingchange', () => update(m));
      });
    }
  }, [checkAndNotify]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-6 bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase italic">
            Batt<span className="text-blue-500">Guard</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 {isMonitoring ? 'Active' : 'Standby'}
               </p>
             </div>
             <div className="hidden sm:block h-2 w-px bg-slate-800"></div>
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${swReady === true ? 'bg-blue-500' : swReady === 'dev_mode' ? 'bg-orange-500' : swReady === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 APK Core: {swReady === true ? 'Ready' : swReady === 'dev_mode' ? 'Dev' : swReady === 'error' ? 'Error' : 'Init'}
               </p>
             </div>
          </div>
        </div>
        <button 
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 ${
            isMonitoring 
              ? 'bg-red-500/10 text-red-500 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
              : 'bg-blue-600 text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)]'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
      </header>

      {swReady === 'dev_mode' && (
        <div className="w-full max-w-4xl mb-6 bg-orange-500/10 border border-orange-500/30 p-4 rounded-2xl flex gap-3 items-center">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-orange-400"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <p className="text-[10px] text-orange-400 font-black uppercase tracking-wider">Режим предварительного просмотра</p>
            <p className="text-[11px] text-orange-300/80 leading-tight">
              Service Worker заблокирован политикой Origin (это нормально в ai.studio). При установке APK с вашего HTTPS хостинга всё будет работать.
            </p>
          </div>
        </div>
      )}

      {wakeLockError && isMonitoring && (
        <div className="w-full max-w-4xl mb-6 bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl flex gap-3 items-center">
           <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-400"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </div>
          <p className="text-[11px] text-blue-300 leading-tight">
            <strong>WakeLock:</strong> Блокировка сна недоступна в этом окне. В реальном APK приложение сможет удерживать экран активным для стабильной работы.
          </p>
        </div>
      )}

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <BatteryIndicator level={battery.level} isCharging={battery.charging} />
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4 flex justify-between">
              <span>Логи событий</span>
              <span className="text-[10px] lowercase text-slate-700 font-bold">{logs.length}/50</span>
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700">
                   <p className="text-[10px] uppercase font-black tracking-widest opacity-30">Логи пусты</p>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="bg-slate-800/20 p-4 rounded-2xl border border-slate-700/30 flex justify-between items-center transition-all hover:bg-slate-800/40">
                    <div>
                      <p className="text-xs font-bold text-slate-200">{log.message}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{log.timestamp.toLocaleTimeString()}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {log.status === 'sent' ? 'OK' : 'FAIL'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border border-blue-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            </div>
            <div className="relative z-10">
              <h3 className="text-lg font-black mb-1">Фоновая работа</h3>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Android агрессивно закрывает приложения. Чтобы уведомления приходили всегда:
              </p>
              <button 
                onClick={() => setShowHelp(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-lg"
              >
                Инструкция по настройке APK
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Настройки алертов</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Имя устройства</label>
                <input type="text" value={settings.phoneName} onChange={e => setSettings({...settings, phoneName: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none transition-all" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Порог (%)</label>
                  <input type="number" value={settings.initialThreshold} onChange={e => setSettings({...settings, initialThreshold: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Шаг (%)</label>
                  <input type="number" value={settings.interval} onChange={e => setSettings({...settings, interval: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-3">
                <input type="password" placeholder="TG Bot Token" value={settings.telegramToken} onChange={e => setSettings({...settings, telegramToken: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs outline-none focus:border-blue-500 transition-all placeholder:text-slate-800" />
                <input type="text" placeholder="TG Chat ID" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs outline-none focus:border-blue-500 transition-all placeholder:text-slate-800" />
              </div>

              <button 
                onClick={async () => {
                  const success = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, `✅ *Связь установлена*\n\nБот готов отправлять уведомления для: ${settings.phoneName}`);
                  alert(success ? "Тест отправлен! Проверьте Telegram." : "Ошибка: Проверьте Token и Chat ID.");
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl transition-all active:scale-[0.98]"
              >
                Тест соединения
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[3rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black italic tracking-tighter">DROID SETUP</h2>
              <button onClick={() => setShowHelp(false)} className="bg-slate-800 p-3 rounded-full text-slate-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="group p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-blue-500/50">
                <h4 className="font-black text-blue-500 uppercase text-[10px] mb-3 tracking-widest">1. Экономия заряда</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">Найдите приложение в настройках Android и установите режим батареи: <strong>«Без ограничений»</strong>.</p>
              </div>

              <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-emerald-500/50">
                <h4 className="font-black text-emerald-500 uppercase text-[10px] mb-3 tracking-widest">2. Автозапуск</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">Разрешите <strong>«Автозапуск»</strong> в разрешениях приложения, чтобы мониторинг начинался сразу после включения телефона.</p>
              </div>

              <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-purple-500/50">
                <h4 className="font-black text-purple-500 uppercase text-[10px] mb-3 tracking-widest">3. Закрепление</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">В меню запущенных приложений нажмите на иконку BattGuard и выберите <strong>«Закрепить» (Замок)</strong>.</p>
              </div>
            </div>

            <button onClick={() => setShowHelp(false)}
              className="w-full mt-10 bg-white text-black font-black py-5 rounded-[2rem] uppercase tracking-[0.2em] text-[10px] hover:bg-slate-200 transition-all shadow-2xl"
            >
              Я всё настроил
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-10 text-slate-800 text-[9px] font-black uppercase tracking-[0.5em]">
        BattGuard Framework v2.1 • PWA Core
      </footer>
    </div>
  );
};

export default App;
