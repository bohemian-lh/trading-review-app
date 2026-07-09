import React, { useState, useCallback } from 'react';
import { Send, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import { generateId } from '@/utils';
import type { JournalDraft } from '@/types';

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

interface EntryState {
  entryId: string;
  openDate: string;
  stockCode: string;
  stockName: string;
  stage: string;
  strategies: string[];
  expanded: boolean;
  submitting: boolean;
  message: string | null;
}

function draftToState(d: JournalDraft): EntryState {
  return { ...d, expanded: true, submitting: false, message: null };
}

export const JournalEntry: React.FC = () => {
  const { activeStages, createJournal, createSnapshot, saveDraft, clearDraft, getAllDraftEntries } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [entries, setEntries] = useState<EntryState[]>(() => {
    const today = getTodayStr();
    const drafts = getAllDraftEntries();
    if (drafts.length > 0) return drafts.map(draftToState);
    return [{
      entryId: `e_${generateId()}`,
      openDate: today,
      stockCode: '',
      stockName: '',
      stage: 'stage1_left',
      strategies: [],
      expanded: true,
      submitting: false,
      message: null,
    }];
  });

  // 每次变更持久化草稿
  const persistEntry = useCallback((e: EntryState) => {
    saveDraft(e.entryId, {
      entryId: e.entryId,
      openDate: e.openDate,
      stockCode: e.stockCode,
      stockName: e.stockName,
      stage: e.stage,
      strategies: e.strategies,
    });
  }, [saveDraft]);

  const updateEntry = (entryId: string, patch: Partial<EntryState>) => {
    setEntries(prev => prev.map(e => {
      if (e.entryId !== entryId) return e;
      const next = { ...e, ...patch };
      persistEntry(next);
      return next;
    }));
  };

  const addEntry = () => {
    setEntries(prev => {
      const entry: EntryState = {
        entryId: `e_${generateId()}`,
        openDate: getTodayStr(),
        stockCode: '',
        stockName: '',
        stage: 'stage1_left',
        strategies: [],
        expanded: true,
        submitting: false,
        message: null,
      };
      return [...prev, entry];
    });
  };

  const removeEntry = (entryId: string) => {
    setEntries(prev => prev.filter(e => e.entryId !== entryId));
    clearDraft(entryId);
  };

  const toggleExpand = (entryId: string) => {
    setEntries(prev => prev.map(e => e.entryId === entryId ? { ...e, expanded: !e.expanded } : e));
  };

  const handleToggleStrategy = (entryId: string, strategyId: string) => {
    setEntries(prev => prev.map(e => {
      if (e.entryId !== entryId) return e;
      const strategies = e.strategies.includes(strategyId)
        ? e.strategies.filter(s => s !== strategyId)
        : [...e.strategies, strategyId];
      const next = { ...e, strategies };
      persistEntry(next);
      return next;
    }));
  };

  const handleSubmitEntry = async (entry: EntryState) => {
    if (!entry.openDate.trim() || !entry.stockCode.trim()) {
      updateEntry(entry.entryId, { message: '请填写开单时间和股票代码' });
      return;
    }
    updateEntry(entry.entryId, { submitting: true, message: null });
    try {
      const snapshot = await createSnapshot(activeStages, datasetId);
      if (!snapshot) throw new Error('创建快照失败');
      await createJournal({
        entryId: entry.entryId,
        openDate: entry.openDate.trim(),
        stockCode: entry.stockCode.trim(),
        stockName: entry.stockName.trim(),
        stage: entry.stage,
        strategies: entry.strategies,
      }, snapshot.snapshotId, datasetId);
      // 提交成功，删除该卡片
      setEntries(prev => prev.filter(e => e.entryId !== entry.entryId));
    } catch (e: any) {
      updateEntry(entry.entryId, { submitting: false, message: `提交失败: ${e.message}` });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{entries.length} 条草稿</span>
        <button
          onClick={addEntry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          新增日志
        </button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          暂无草稿，点击「新增日志」开始填写
        </div>
      )}

      {entries.map(entry => {
        const stageConfig = activeStages.find(s => s.stageId === entry.stage);
        return (
          <div key={entry.entryId} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
            {/* 折叠头 */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand(entry.entryId)}
            >
              <div className="flex items-center gap-4">
                {entry.expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                <span className="text-sm font-medium text-gray-900">
                  {entry.openDate || '未填写日期'} | {entry.stockCode || '未填代码'} | {entry.stockName || '未填名称'}
                </span>
                {entry.strategies.length > 0 && (
                  <span className="text-xs text-gray-400">{entry.strategies.length} 项策略</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeEntry(entry.entryId); }}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* 展开内容 */}
            {entry.expanded && (
              <div className="px-4 pb-4 space-y-4 border-t">
                {/* 股票信息输入 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">开单时间 *</label>
                    <input
                      type="text"
                      value={entry.openDate}
                      onChange={(e) => updateEntry(entry.entryId, { openDate: e.target.value })}
                      placeholder="例如: 20250101"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">股票代码 *</label>
                    <input
                      type="text"
                      value={entry.stockCode}
                      onChange={(e) => updateEntry(entry.entryId, { stockCode: e.target.value })}
                      placeholder="例如: 600519"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">股票名称</label>
                    <input
                      type="text"
                      value={entry.stockName}
                      onChange={(e) => updateEntry(entry.entryId, { stockName: e.target.value })}
                      placeholder="例如: 贵州茅台"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* 阶段选择 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">阶段</label>
                  <select
                    value={entry.stage}
                    onChange={(e) => updateEntry(entry.entryId, { stage: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    {activeStages.map(s => (
                      <option key={s.stageId} value={s.stageId}>{s.stageName}</option>
                    ))}
                  </select>
                </div>

                {/* 策略组卡片 */}
                {stageConfig && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stageConfig.strategyGroups.map(group => (
                      <StrategyCard
                        key={group.groupId}
                        group={group}
                        selectedIds={entry.strategies}
                        onToggleStrategy={(sid) => handleToggleStrategy(entry.entryId, sid)}
                      />
                    ))}
                  </div>
                )}

                {/* 标记 + 提交 */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <div />
                  <div className="flex items-center gap-3">
                    {entry.message && (
                      <span className={`text-xs ${entry.message.includes('失败') ? 'text-red-600' : 'text-green-600'}`}>
                        {entry.message}
                      </span>
                    )}
                    <button
                      onClick={() => handleSubmitEntry(entry)}
                      disabled={entry.submitting}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {entry.submitting ? '提交中...' : '提交创建'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
