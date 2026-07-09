import React, { useEffect, useState } from 'react';
import { FileText, ListFilter } from 'lucide-react';
import { JournalEntry } from '@/components/journal/JournalEntry';
import { JournalViewer } from '@/components/journal/JournalViewer';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';

const TradingJournalPage: React.FC = () => {
  const [tab, setTab] = useState<'entry' | 'view'>('entry');
  const { init, loading, error } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  useEffect(() => {
    init(datasetId);
  }, [datasetId, init]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">交易日志</h1>
        <p className="text-sm text-gray-500 mt-1">填写并提交交易日志，支持按阶段选择策略组</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('entry')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'entry' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="h-4 w-4" />
          填写提交
        </button>
        <button
          onClick={() => setTab('view')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'view' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ListFilter className="h-4 w-4" />
          已存储日志
        </button>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      )}
      {error && (
        <div className="text-center py-8 text-red-500">加载失败: {error}</div>
      )}
      {!loading && !error && (
        tab === 'entry' ? <JournalEntry /> : <JournalViewer />
      )}
    </div>
  );
};

export default TradingJournalPage;
