import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { ReminderConfig } from '@/utils/reminderTimer';

interface ReminderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: ReminderConfig;
  onSave: (config: ReminderConfig) => void;
}

const INTERVAL_OPTIONS = [
  { value: 5_000, label: '5 秒' },
  { value: 10_000, label: '10 秒' },
  { value: 15_000, label: '15 秒' },
  { value: 30_000, label: '30 秒' },
  { value: 60_000, label: '60 秒' },
];

export const ReminderSettings: React.FC<ReminderSettingsProps> = ({ isOpen, onClose, config, onSave }) => {
  const [times, setTimes] = useState<string[]>(config.times);
  const [newTime, setNewTime] = useState('10:00');
  const [intervalMs, setIntervalMs] = useState(config.intervalMs);

  // 关闭时保存
  const handleClose = () => {
    onSave({ ...config, times, intervalMs });
    onClose();
  };

  const handleAdd = () => {
    if (!newTime || times.includes(newTime)) return;
    setTimes(prev => [...prev, newTime].sort());
  };

  const handleRemove = (time: string) => {
    setTimes(prev => prev.filter(t => t !== time));
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="定时提醒设置" size="sm">
      <div className="space-y-4 mt-4">

        {/* 轮询间隔 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">检查间隔</label>
          <select
            value={intervalMs}
            onChange={e => setIntervalMs(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {INTERVAL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 提醒时间列表 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">提醒时间点</label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {times.length === 0 && (
              <p className="text-sm text-gray-400 py-2">暂无时间点，请添加</p>
            )}
            {times.map(time => (
              <div key={time} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-1.5 text-sm">
                <span className="text-gray-700 font-mono">{time}</span>
                <button
                  onClick={() => handleRemove(time)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 添加时间 */}
        <div className="flex gap-2">
          <input
            type="time"
            value={newTime}
            onChange={e => setNewTime(e.target.value)}
            step="300"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!newTime || times.includes(newTime)}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md border border-blue-200 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>
        </div>
      </div>
    </Modal>
  );
};
