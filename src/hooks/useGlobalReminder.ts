import { useEffect, useRef } from 'react';
import { useReminderStore } from '@/stores/reminderStore';
import { ReminderTimer, primeReminderAudio } from '@/utils/reminderTimer';

/**
 * 全局定时提醒宿主：在 App 根组件调用。
 * 因为不随路由卸载，所以提醒在整个应用打开期间都有效。
 */
export function useGlobalReminder() {
  const config = useReminderStore(s => s.config);
  const timerRef = useRef<ReminderTimer | null>(null);

  // 任意首次用户交互时解锁音频（浏览器自动播放策略要求手势）
  useEffect(() => {
    const unlock = () => primeReminderAudio();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // 配置变化（开关/时间点/间隔）即重启定时器
  useEffect(() => {
    if (!config.enabled) {
      timerRef.current?.stop();
      return;
    }
    if (!timerRef.current) timerRef.current = new ReminderTimer(config);
    else timerRef.current.updateConfig(config);
    timerRef.current.start();
  }, [config]);

  useEffect(() => () => { timerRef.current?.stop(); }, []);
}
