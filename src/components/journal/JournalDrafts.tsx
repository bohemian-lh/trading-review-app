import React, { useState } from 'react';
import { Bold, AlertTriangle, Send, Trash2, Edit2 } from 'lucide-react';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import type { TradingJournal } from '@/types';

export const JournalDrafts: React.FC = () => {
  const { journals, activeStages, createSnapshot, finalizeJournal, updateDraftJournal, deleteJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { stage: string; strategies: string[]; isBold: boolean; isRed: boolean }>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  // 只显示 draft 状态
  const drafts = journals.filter(j => j.status === 'draft');

  const startEditing = (j: TradingJournal) => {
    setEditingId(j.id);
    setEditState(prev => ({
      ...prev,
      [j.id]: { stage: j.stage, strategies: [...j.strategies], isBold: false, isRed: false },
    }));
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const getEditState = (id: string) => editState[id] || { stage: '', strategies: [], isBold: false, isRed: false };

  const updateEditState = (id: string, patch: Partial<typeof editState[string]>) => {
    setEditState(prev => ({ ...prev, [id]: { ...getEditState(id), ...patch } }));
  };

  const handleToggleStrategy = (id: string, strategyId: string) => {
    const es = getEditState(id);
    updateEditState(id, {
      strategies: es.strategies.includes(strategyId)
        ? es.strategies.filter(s => s !== strategyId)
        : [...es.strategies, strategyId],
    });
  };

  const handleSaveEdit = async (journalId: string) => {
    const es = editState[journalId];
    if (!es) return;
    // 创建新快照
    const snapshot = await createSnapshot(activeStages, datasetId);
    if (!snapshot) return;
    await updateDraftJournal(journalId, {
      stage: es.stage,
      strategies: es.strategies,
      snapshotId: snapshot.snapshotId,
    }, datasetId);
    setEditingId(null);
  };

  const handleFinalize = async (journalId: string) => {
    setSubmittingIds(prev => new Set([...prev, journalId]));
    try {
      await finalizeJournal(journalId, datasetId);
    } finally {
      setSubmittingIds(prev => {
        const next = new Set(prev);
        next.delete(journalId);
        return next;
      });
    }
  };

  const handleDelete = async (journalId: string) => {
    if (!confirm('确认删除此条创建？')) return;
    await deleteJournal(journalId, datasetId);
  };

  const stageName = (stageId: string) =>
    activeStages.find(s => s.stageId === stageId)?.stageName || stageId;

  const stageOptions = activeStages;

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        暂无当前交易，请先在「填写提交」中创建
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500">{drafts.length} 条当前交易</div>

      {drafts.map(journal => {
        const isEditing = editingId === journal.id;
        const es = getEditState(journal.id);
        const currentStage = isEditing ? es.stage : journal.stage;
        const currentStrategies = isEditing ? es.strategies : journal.strategies;
        const stageConfig = activeStages.find(s => s.stageId === currentStage);
        const isSubmitting = submittingIds.has(journal.id);

        // ─── 紧凑模式 ───
        if (!isEditing) {
          return (
            <div key={journal.id} className="border border-gray-200 rounded-lg p-3 bg-white flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-6 min-w-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {journal.stockName || '未命名'} ({journal.stockCode || '-'})
                  </div>
                  <div className="text-xs text-gray-400">{journal.openDate}</div>
                </div>
                <div className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                  {stageName(journal.stage)}
                </div>
                <div className="text-xs text-gray-500">
                  {journal.strategies.length} 项策略
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => startEditing(journal)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="h-3 w-3" />
                  编辑
                </button>
                <button
                  onClick={() => handleFinalize(journal.id)}
                  disabled={isSubmitting}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  {isSubmitting ? '...' : '提交日志'}
                </button>
                <button
                  onClick={() => handleDelete(journal.id)}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        }

        // ─── 编辑模式 ───
        return (
          <div key={journal.id} className="border-2 border-blue-300 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">
                编辑: {journal.stockName || '未命名'} ({journal.stockCode || '-'}) - {journal.openDate}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={cancelEditing} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                  取消
                </button>
                <button
                  onClick={() => handleSaveEdit(journal.id)}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  保存编辑
                </button>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-4 pt-4">
              {/* 阶段选择 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">阶段</label>
                <select
                  value={es.stage}
                  onChange={(e) => updateEditState(journal.id, { stage: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {stageOptions.map(s => (
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
                      selectedIds={currentStrategies}
                      onToggleStrategy={(sid) => handleToggleStrategy(journal.id, sid)}
                    />
                  ))}
                </div>
              )}

              {/* 标记 */}
              <div className="flex items-center gap-3 pt-3 border-t">
                <button
                  onClick={() => updateEditState(journal.id, { isBold: !es.isBold })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${es.isBold ? 'bg-gray-200 text-gray-900 font-bold' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  <Bold className="h-3.5 w-3.5" />
                  加粗
                </button>
                <button
                  onClick={() => updateEditState(journal.id, { isRed: !es.isRed })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${es.isRed ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  圈红
                </button>
                <button
                  onClick={() => handleFinalize(journal.id)}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium ml-auto"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isSubmitting ? '提交中...' : '提交日志'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
