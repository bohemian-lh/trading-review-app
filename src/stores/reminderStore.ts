import { create } from 'zustand';
import { getReminderConfig, setReminderConfig, primeReminderAudio } from '@/utils/reminderTimer';
import type { ReminderConfig } from '@/utils/reminderTimer';

/**
 * 定时提醒配置的单一数据源。
 * 定时器本体由全局宿主 useGlobalReminder 驱动，因此离开交易日志页后依然有效。
 */
interface ReminderState {
  config: ReminderConfig;
  toggle: () => void;
  setConfig: (config: ReminderConfig) => void;
}

const persist = (config: ReminderConfig): ReminderConfig => {
  setReminderConfig(config);
  // 在用户手势内解锁音频，保证到点能发声
  if (config.enabled) primeReminderAudio();
  return config;
};

export const useReminderStore = create<ReminderState>((set, get) => ({
  config: getReminderConfig(),

  toggle: () => {
    const next = { ...get().config, enabled: !get().config.enabled };
    set({ config: persist(next) });
  },

  setConfig: (config) => {
    set({ config: persist(config) });
  },
}));
