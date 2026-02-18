
export interface AppSettings {
  phoneName: string;
  telegramToken: string;
  telegramChatId: string;
  initialThreshold: number;
  interval: number;
  finalThreshold: number;
}

export interface BatteryStatus {
  level: number;
  charging: boolean;
}

export interface NotificationLog {
  id: string;
  timestamp: Date;
  level: number;
  message: string;
  status: 'sent' | 'failed';
}

export interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => any) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => any) | null;
}

declare global {
  interface Navigator {
    getBattery(): Promise<BatteryManager>;
  }
}
