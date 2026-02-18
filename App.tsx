
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
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
  const sentThresholdsRef = useRef<Set<number>>(new Set());
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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
      <header className="w-full max-w-4xl flex justify-between items-center mb-8 bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white">
            BATTERY <span className="text-blue-500">GUARDIAN</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
             <div className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
             <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">
               {isMonitoring ? 'Running' : 'Standby'}
             </p>
          </div>
        </div>
        <button 
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
            isMonitoring 
              ? 'bg-red-500/10 text-red-500 border border-red-500/50' 
              : 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
      </header>

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-6">
          <BatteryIndicator level={battery.level} isCharging={battery.charging} />
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4">Логи системы</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <p className="text-slate-600 text-center py-10 text-xs uppercase font-bold">Ожидание событий...</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="bg-slate-800/30 p-3 rounded-2xl border border-slate-700/30 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold">{log.message}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{log.timestamp.toLocaleTimeString()}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${log.status === 'sent' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {/* APK Build Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414C17.0609 15.3414 16.691 14.9715 16.691 14.5093V13.6773H7.30896V14.5093C7.30896 14.9715 6.93905 15.3414 6.4769 15.3414C6.01476 15.3414 5.64484 14.9715 5.64484 14.5093V8.68351C5.64484 8.22136 6.01476 7.85145 6.4769 7.85145C6.93905 7.85145 7.30896 8.22136 7.30896 8.68351V9.51555H16.691V8.68351C16.691 8.22136 17.0609 7.85145 17.523 7.85145C17.9852 7.85145 18.3551 8.22136 18.3551 8.68351V14.5093C18.3551 14.9715 17.9852 15.3414 17.523 15.3414Z"/></svg>
            </div>
            <h3 className="text-lg font-black mb-2">Получить APK</h3>
            <p className="text-xs text-blue-100 mb-4 leading-relaxed">
              Чтобы использовать приложение как полноценную Android программу с автозапуском:
            </p>
            <ol className="text-[10px] space-y-2 text-blue-50 text-left list-decimal list-inside font-medium">
              <li>Разверните этот код на HTTPS хостинге.</li>
              <li>Скопируйте URL в <strong>pwabuilder.com</strong>.</li>
              <li>Скачайте сгенерированный <strong>Android APK</strong>.</li>
            </ol>
            <button 
              onClick={() => setShowHelp(true)}
              className="mt-4 w-full bg-white/20 hover:bg-white/30 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all"
            >
              Инструкция по настройке системы
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Настройки</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Имя устройства</label>
                  <input type="text" value={settings.phoneName} onChange={e => setSettings({...settings, phoneName: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Порог (%)</label>
                    <input type="number" value={settings.initialThreshold} onChange={e => setSettings({...settings, initialThreshold: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Шаг (%)</label>
                    <input type="number" value={settings.interval} onChange={e => setSettings({...settings, interval: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800">
                <input type="password" placeholder="Telegram Bot Token" value={settings.telegramToken} onChange={e => setSettings({...settings, telegramToken: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-blue-500 transition-all" />
                <input type="text" placeholder="Telegram Chat ID" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-blue-500 transition-all" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modal Instruction */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic tracking-tighter">OS SETUP</h2>
              <button onClick={() => setShowHelp(false)} className="bg-slate-800 p-2 rounded-full text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="space-y-6 text-xs font-medium">
              <div className="p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20">
                <h4 className="font-black text-blue-400 uppercase mb-2">1. Контроль активности</h4>
                <p className="text-slate-400 leading-relaxed">В настройках Android для этого приложения выберите <strong>«Батарея» -> «Без ограничений»</strong>. Это критически важно для фоновой работы.</p>
              </div>

              <div className="p-4 bg-emerald-500/10 rounded-3xl border border-emerald-500/20">
                <h4 className="font-black text-emerald-400 uppercase mb-2">2. Автозагрузка</h4>
                <p className="text-slate-400 leading-relaxed">Включите тумблер <strong>«Автозапуск»</strong> в настройках разрешений приложения. После этого APK будет стартовать вместе с системой.</p>
              </div>

              <div className="p-4 bg-purple-500/10 rounded-3xl border border-purple-500/20">
                <h4 className="font-black text-purple-400 uppercase mb-2">3. Закрепление</h4>
                <p className="text-slate-400 leading-relaxed">Зайдите в меню запущенных приложений и нажмите <strong>«Замок»</strong> на карточке Guardian, чтобы система не выгружала его из памяти.</p>
              </div>
            </div>

            <button onClick={() => setShowHelp(false)}
              className="w-full mt-8 bg-white text-black font-black py-4 rounded-3xl uppercase tracking-widest text-xs hover:scale-[0.98] transition-transform"
            >
              Принять настройки
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-8 text-slate-800 text-[10px] font-black uppercase tracking-[0.3em]">
        BattGuard Mobile OS Framework
      </footer>
    </div>
  );
};

export default App;
