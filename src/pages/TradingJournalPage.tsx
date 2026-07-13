import React, { useEffect, useState } from 'react';
import { FileText, ListFilter, ClipboardList, Eye } from 'lucide-react';
import { JournalEntry } from '@/components/journal/JournalEntry';
import { JournalDrafts } from '@/components/journal/JournalDrafts';
import { JournalDraftsTestA } from '@/components/journal/JournalDraftsTestA';
import { JournalDraftsTestB } from '@/components/journal/JournalDraftsTestB';
import { JournalDraftsTestC } from '@/components/journal/JournalDraftsTestC';
import { JournalViewer } from '@/components/journal/JournalViewer';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';

type Tab = 'entry' | 'drafts' | 'view' | 'testA' | 'testB' | 'testC';

const TradingJournalPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('entry');
  const { init, loading, error } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  useEffect(() => {
    init(datasetId);
  }, [datasetId, init]);

  const mainTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'entry', label: '填写提交', icon: <FileText className="h-4 w-4" /> },
    { key: 'drafts', label: '当前交易', icon: <ClipboardList className="h-4 w-4" /> },
    { key: 'view', label: '已存储日志', icon: <ListFilter className="h-4 w-4" /> },
  ];

  const testTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'testA', label: 'A测试', icon: <Eye className="h-4 w-4" /> },
    { key: 'testB', label: 'B测试', icon: <Eye className="h-4 w-4" /> },
    { key: 'testC', label: 'C测试', icon: <Eye className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">交易日志</h1>
        <p className="text-sm text-gray-500 mt-1">填写 → 创建 → 编辑 → 提交 → 存储</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {mainTabs.map(t => (
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
        <span className="w-px bg-gray-300 mx-1 self-stretch" />
        {testTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-orange-600 shadow' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
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
        tab === 'testA' ? <JournalDraftsTestA /> :
        tab === 'testB' ? <JournalDraftsTestB /> :
        tab === 'testC' ? <JournalDraftsTestC /> :
        <JournalViewer />
      )}
    </div>
  );
};

export default TradingJournalPage;
