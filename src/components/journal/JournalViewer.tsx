import React, { useState, useMemo } from 'react';
import { Trash2, Link, Undo2 } from 'lucide-react';
import { useRecordsStore } from '@/stores';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import type { TradingJournal } from '@/types';

export const JournalViewer: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const { journals, snapshots, activeStages, deleteJournal, updateJournalRecordId, revertJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [filterDate, setFilterDate] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [matchingJournalId, setMatchingJournalId] = useState<string | null>(null);

  /** 通过 snapshotId 查找策略文本 */
  const resolveStrategyText = (journal: TradingJournal): Record<string, string> => {
    const snapshot = snapshots.find(s => s.snapshotId === journal.snapshotId);
    const stages = snapshot?.stages || activeStages;
    const idMap: Record<string, string> = {};
    for (const stage of stages) {
      for (const g of stage.strategyGroups) {
        for (const s of g.strategies) {
          idMap[s.strategyId] = s.text;
        }
      }
    }
    const result: Record<string, string> = {};
    for (const sid of journal.strategies) {
      result[sid] = idMap[sid] || `(已删除: ${sid})`;
    }
    return result;
  };

  const filtered = useMemo(() => {
    return journals.filter(j => {
      if (j.status !== 'submitted') return false;
      if (filterDate && !j.openDate.includes(filterDate.replace(/-/g, ''))) return false;
      if (filterCode && !j.stockCode.includes(filterCode)) return false;
      return true;
    });
  }, [journals, filterDate, filterCode]);

  const handleDelete = async (journalId: string) => {
    if (!confirm('确认删除此条日志？')) return;
    await deleteJournal(journalId, datasetId);
  };

  const handleRevert = async (journalId: string) => {
    if (!confirm('确认回退此条日志到「当前交易」？回退后可在当前交易界面编辑。')) return;
    await revertJournal(journalId, datasetId);
  };

  const handleMatch = async (journalId: string, recordId: string | undefined) => {
    await updateJournalRecordId(journalId, recordId || undefined, datasetId);
    setMatchingJournalId(null);
  };

  // 已关联记录的信息
  const getLinkedRecord = (journal: TradingJournal) => {
    if (!journal.recordId) return null;
    return records.find(r => r.id === journal.recordId);
  };

  const sortedRecords = [...records].sort((a, b) => b.openDate.localeCompare(a.openDate));

  return (
    <div className="space-y-6">
      {/* 筛选 */}
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            placeholder="按开单时间筛选 (如: 20250101)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            placeholder="按股票代码筛选 (如: 600519)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm text-gray-400 flex items-center">
          共 {filtered.length} 条
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {journals.length === 0 ? '暂无已提交的日志' : '无匹配结果'}
        </div>
      )}

      <div className="space-y-4">
        {filtered.map(journal => {
          const strMap = resolveStrategyText(journal);
          const stageName = activeStages.find(s => s.stageId === journal.stage)?.stageName || journal.stage;
          const linkedRecord = getLinkedRecord(journal);

          return (
            <div key={journal.id} className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {journal.stockName || '未知'} ({journal.stockCode || '-'})
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {journal.openDate || '-'} | {stageName}
                    {linkedRecord ? (
                      <span className="ml-2 text-green-600">
                        已关联: {linkedRecord.stockName}({linkedRecord.stockCode})
                      </span>
                    ) : (
                      <span className="ml-2 text-orange-400">未关联</span>
                    )}
                    <span className="ml-2">提交于 {new Date(journal.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* 手动匹配按钮 */}
                  {matchingJournalId === journal.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        onChange={(e) => {
                          handleMatch(journal.id, e.target.value || undefined);
                        }}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="">-- 不关联 --</option>
                        {sortedRecords.map(r => (
                          <option key={r.id} value={r.id} selected={r.id === journal.recordId}>
                            {r.openDate} {r.stockName}({r.stockCode})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setMatchingJournalId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMatchingJournalId(journal.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Link className="h-3 w-3" />
                      匹配记录
                    </button>
                  )}
                  <button
                    onClick={() => handleRevert(journal.id)}
                    className="text-orange-400 hover:text-orange-600"
                    title="回退到当前交易"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(journal.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {journal.strategies.map(sid => (
                  <span key={sid} className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-full text-xs">
                    {strMap[sid] || sid}
                  </span>
                ))}
                {journal.strategies.length === 0 && (
                  <span className="text-xs text-gray-400 italic">无策略</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
