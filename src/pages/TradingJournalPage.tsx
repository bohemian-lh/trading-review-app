import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, FileText, ListFilter, ClipboardList } from 'lucide-react';
import { JournalEntry } from '@/components/journal/JournalEntry';
import { JournalDrafts } from '@/components/journal/JournalDrafts';
import { JournalViewer } from '@/components/journal/JournalViewer';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { ReminderTimer, isReminderEnabled, setReminderEnabled } from '@/utils/reminderTimer';

type Tab = 'entry' | 'drafts' | 'view';

const TradingJournalPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('entry');
  const { init, loading, error } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  // ─── 定时提醒 ──────────────────────────────────────────────────
  const [reminderOn, setReminderOn] = useState(isReminderEnabled);
  const timerRef = useRef<ReminderTimer | null>(null);

  const toggleReminder = useCallback(() => {
    setReminderOn(prev => {
      const next = !prev;
      setReminderEnabled(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (reminderOn) {
      if (!timerRef.current) timerRef.current = new ReminderTimer();
      timerRef.current.start();
    } else {
      timerRef.current?.stop();
    }
    return () => { timerRef.current?.stop(); };
  }, [reminderOn]);

  useEffect(() => {
    init(datasetId);
  }, [datasetId, init]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'entry', label: '填写提交', icon: <FileText className="h-4 w-4" /> },
    { key: 'drafts', label: '当前交易', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'view', label: '已存储日志', icon: <ListFilter className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">交易日志</h1>
        <p className="text-sm text-gray-500 mt-1">填写 → 创建 → 编辑 → 提交 → 存储</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {/* 定时提醒开关 */}
        <button
          onClick={toggleReminder}
          title={reminderOn ? '关闭定时提醒' : '开启定时提醒'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            reminderOn
              ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
              : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {reminderOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          定时提醒
        </button>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      )}
      {error && (
        <div className="text-center py-8 text-red-500">加载失败: {error}</div>
      )}
      {!loading && !error && (
        tab === 'entry' ? <JournalEntry /> :
        tab === 'drafts' ? <JournalDrafts /> :
        <JournalViewer />
      )}
    </div>
  );
};

export default TradingJournalPage;
