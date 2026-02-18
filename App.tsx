
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
  const [swReady, setSwReady] = useState<boolean | 'loading' | 'error' | 'not_supported'>('loading');
  const [swError, setSwError] = useState<string>('');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
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
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
      } catch (err) {
        console.error('WakeLock error:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
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
          <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white">
            BATTERY <span className="text-blue-500">GUARDIAN</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 {isMonitoring ? 'Monitoring' : 'Standby'}
               </p>
             </div>
             <div className="hidden sm:block h-2 w-px bg-slate-800"></div>
             <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${swReady === true ? 'bg-blue-500' : swReady === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
               <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">
                 PWA: {swReady === true ? 'Ready' : swReady === 'error' ? 'Error' : 'Init'}
               </p>
             </div>
          </div>
        </div>
        <button 
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 ${
            isMonitoring 
              ? 'bg-red-500/10 text-red-500 border border-red-500/50' 
              : 'bg-blue-600 text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)]'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
      </header>

      {swReady === 'error' && (
        <div className="w-full max-w-4xl mb-6 bg-red-500/10 border border-red-500/30 p-4 rounded-2xl">
          <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-1">Ошибка Service Worker (Origin Mismatch):</p>
          <p className="text-[11px] text-red-300 leading-tight">
            Это нормально для среды разработки (ai.studio). При развертывании на вашем хостинге (GitHub/Vercel) ошибка исчезнет, и APK будет валидным.
          </p>
        </div>
      )}

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <BatteryIndicator level={battery.level} isCharging={battery.charging} />
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4 flex justify-between">
              <span>Логи системы</span>
              <span className="text-[10px] lowercase text-slate-700 font-bold">{logs.length}/50</span>
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-20"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                   <p className="text-[10px] uppercase font-black tracking-widest">Ожидание событий...</p>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="bg-slate-800/20 p-4 rounded-2xl border border-slate-700/30 flex justify-between items-center transition-all hover:bg-slate-800/40">
                    <div>
                      <p className="text-xs font-bold text-slate-200">{log.message}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{log.timestamp.toLocaleTimeString()}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {log.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-black mb-1">APK Валидация</h3>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Для успешной сборки APK через PWABuilder:
              </p>
              <div className="space-y-3">
                 <div className="flex gap-3">
                    <div className={`mt-1 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${swReady === true ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                       <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <p className="text-[10px] font-bold text-slate-300">Разверните на HTTPS хостинге (не в превью)</p>
                 </div>
                 <div className="flex gap-3">
                    <div className={`mt-1 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${swReady === true ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                       <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <p className="text-[10px] font-bold text-slate-300">Дождитесь статуса PWA: Ready (синий кружок)</p>
                 </div>
              </div>
              <button 
                onClick={() => setShowHelp(true)}
                className="mt-6 w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Системные настройки Android
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Настройки уведомлений</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Имя телефона</label>
                <input type="text" value={settings.phoneName} onChange={e => setSettings({...settings, phoneName: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none transition-all" placeholder="Название телефона" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Начало (%)</label>
                  <input type="number" value={settings.initialThreshold} onChange={e => setSettings({...settings, initialThreshold: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 ml-1">Интервал (%)</label>
                  <input type="number" value={settings.interval} onChange={e => setSettings({...settings, interval: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-3">
                <input type="password" placeholder="Telegram Bot Token" value={settings.telegramToken} onChange={e => setSettings({...settings, telegramToken: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs outline-none focus:border-blue-500 transition-all" />
                <input type="text" placeholder="Telegram Chat ID" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs outline-none focus:border-blue-500 transition-all" />
              </div>

              <button 
                onClick={async () => {
                  const success = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, `🔔 Тест: ${settings.phoneName}\nСистема исправна.`);
                  alert(success ? "ОК: Проверьте Telegram!" : "Ошибка: Проверьте Token/ID");
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl transition-all active:scale-[0.98]"
              >
                Отправить тест
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Modern Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[3rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black italic tracking-tighter">DROID SETUP</h2>
              <button onClick={() => setShowHelp(false)} className="bg-slate-800 p-3 rounded-full text-slate-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="group p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-blue-500/50">
                <h4 className="font-black text-blue-500 uppercase text-xs mb-3 tracking-widest">01. Энергопотребление</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">Зайдите в настройки Android → Приложения → Battery Guardian → Батарея → <strong>«Без ограничений»</strong>.</p>
              </div>

              <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-emerald-500/50">
                <h4 className="font-black text-emerald-500 uppercase text-xs mb-3 tracking-widest">02. Автозапуск</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">Разрешите приложению <strong>«Автозапуск»</strong> в меню разрешений. Это обеспечит старт при перезагрузке.</p>
              </div>

              <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] transition-all hover:border-purple-500/50">
                <h4 className="font-black text-purple-500 uppercase text-xs mb-3 tracking-widest">03. Уведомления</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">Убедитесь, что уведомления разрешены на уровне системы, иначе Telegram алерты могут блокироваться.</p>
              </div>
            </div>

            <button onClick={() => setShowHelp(false)}
              className="w-full mt-10 bg-white text-black font-black py-5 rounded-[2rem] uppercase tracking-[0.2em] text-[10px] hover:scale-[0.97] transition-all shadow-2xl"
            >
              Конфигурация завершена
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-10 text-slate-800 text-[9px] font-black uppercase tracking-[0.5em]">
        BattGuard Pro • Build 2024.APK
      </footer>
    </div>
  );
};

export default App;
