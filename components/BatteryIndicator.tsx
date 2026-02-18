
import React from 'react';

interface BatteryIndicatorProps {
  level: number;
  isCharging: boolean;
}

const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ level, isCharging }) => {
  const percentage = Math.round(level * 100);
  
  const getColor = () => {
    if (isCharging) return 'bg-blue-400';
    if (percentage <= 10) return 'bg-red-500';
    if (percentage <= 25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getShadow = () => {
    if (isCharging) return 'shadow-[0_0_20px_rgba(96,165,250,0.5)]';
    if (percentage <= 10) return 'shadow-[0_0_20px_rgba(239,68,68,0.5)]';
    if (percentage <= 25) return 'shadow-[0_0_20px_rgba(234,179,8,0.5)]';
    return 'shadow-[0_0_20px_rgba(34,197,94,0.5)]';
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-800/50 rounded-3xl border border-slate-700/50 backdrop-blur-sm">
      <div className="relative w-24 h-48 border-4 border-slate-600 rounded-xl p-1 flex items-end">
        {/* Battery Tip */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-3 bg-slate-600 rounded-t-sm" />
        
        {/* Fill */}
        <div 
          className={`w-full rounded-lg transition-all duration-700 ease-out ${getColor()} ${getShadow()}`}
          style={{ height: `${percentage}%` }}
        >
          {isCharging && (
            <div className="absolute inset-0 flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                <path d="M13 10V3L4 14H11V21L20 10H13Z" />
              </svg>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 text-center">
        <span className="text-5xl font-bold tracking-tight">{percentage}%</span>
        <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest font-medium">
          {isCharging ? 'Charging' : 'Discharging'}
        </p>
      </div>
    </div>
  );
};

export default BatteryIndicator;
