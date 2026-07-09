import React, { useState, useMemo } from 'react';
import { Bold, AlertTriangle, Send, Trash2, Edit2, X } from 'lucide-react';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import type { TradingJournal } from '@/types';

/** 按策略组分组解析策略文本 */
function groupStrategies(
  journal: TradingJournal,
  stages: any[],
  snapshots: any[]
): Record<string, string[]> {
  const snapshot = snapshots.find((s: any) => s.snapshotId === journal.snapshotId);
  const stageConfigs = snapshot?.stages || stages;
  const stage = stageConfigs.find((s: any) => s.stageId === journal.stage);
  if (!stage) return {};
  const result: Record<string, string[]> = {};
  for (const g of stage.strategyGroups) {
    result[g.groupId] = [];
    result[`${g.groupId}_name`] = [g.groupName];
    for (const s of g.strategies) {
      if (journal.strategies.includes(s.strategyId)) {
        result[g.groupId].push(s.text);
      }
    }
  }
  return result;
}

export const JournalDrafts: React.FC = () => {
  const { journals, snapshots, activeStages, createSnapshot, finalizeJournal, updateDraftJournal, deleteJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { stage: string; strategies: string[]; isBold: boolean; isRed: boolean }>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  const drafts = journals.filter(j => j.status === 'draft');

  // 策略组 ID 顺序（固定 4 组）
  const groupIds = ['g1', 'g2', 'g3', 'g4'];
  const groupNames = useMemo(() => {
    const stage = activeStages[0];
    if (!stage) return ['策略组1', '策略组2', '策略组3', '策略组4'];
    return stage.strategyGroups.map(g => g.groupName);
  }, [activeStages]);

  const startEditing = (j: TradingJournal) => {
    setEditingId(j.id);
    setEditState(prev => ({
      ...prev,
      [j.id]: { stage: j.stage, strategies: [...j.strategies], isBold: false, isRed: false },
    }));
  };

  const cancelEditing = () => setEditingId(null);

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

      {/* ─── 表格式列表 ─── */}
      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-r">股票名称</th>
              {groupNames.map((name, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-r">{name}</th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-40">操作</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map(journal => {
              const grouped = groupStrategies(journal, activeStages, snapshots);
              const isSubmitting = submittingIds.has(journal.id);
              const isEditing = editingId === journal.id;
              const es = getEditState(journal.id);
              const currentStage = isEditing ? es.stage : journal.stage;
              const currentStrategies = isEditing ? es.strategies : journal.strategies;
              const stageConfig = activeStages.find(s => s.stageId === currentStage);

              // 编辑模式：单独的行上覆盖展开面板
              if (isEditing) {
                return (
                  <React.Fragment key={journal.id}>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 border-r text-gray-900 font-medium" colSpan={5}>
                        <div className="flex items-center justify-between">
                          <span>编辑: {journal.stockName || '-'} ({journal.stockCode || '-'}) - {journal.openDate}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={cancelEditing} className="text-xs text-gray-500 hover:text-gray-700"><X className="h-3 w-3 inline mr-0.5" />取消</button>
                            <button onClick={() => handleSaveEdit(journal.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">保存编辑</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-3" colSpan={5}>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">阶段</label>
                            <select value={es.stage} onChange={(e) => updateEditState(journal.id, { stage: e.target.value })}
                              className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                              {stageOptions.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
                            </select>
                          </div>
                          {stageConfig && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {stageConfig.strategyGroups.map(group => (
                                <StrategyCard key={group.groupId} group={group} selectedIds={currentStrategies}
                                  onToggleStrategy={(sid) => handleToggleStrategy(journal.id, sid)} />
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-3 border-t">
                            <div className="flex items-center gap-3">
                              <button onClick={() => updateEditState(journal.id, { isBold: !es.isBold })}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${es.isBold ? 'bg-gray-200 text-gray-900 font-bold' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                <Bold className="h-3.5 w-3.5" />加粗</button>
                              <button onClick={() => updateEditState(journal.id, { isRed: !es.isRed })}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${es.isRed ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                <AlertTriangle className="h-3.5 w-3.5" />圈红</button>
                            </div>
                            <button onClick={() => handleFinalize(journal.id)} disabled={isSubmitting}
                              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                              <Send className="h-3.5 w-3.5" />{isSubmitting ? '...' : '提交日志'}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }

              // 紧凑模式：表格式一行
              return (
                <tr key={journal.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 border-r min-w-[100px]">
                    <div className="font-medium text-gray-900">{journal.stockName || '-'}</div>
                    <div className="text-xs text-gray-400">{journal.stockCode}{journal.openDate ? ` / ${journal.openDate}` : ''}</div>
                  </td>
                  {groupIds.map(gid => (
                    <td key={gid} className="px-3 py-2 border-r min-w-[80px] align-top">
                      {(grouped[gid] || []).length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {grouped[gid].map((text, i) => (
                            <span key={i} className="text-xs text-gray-700">{text}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => startEditing(journal)} className="text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-1 rounded" title="编辑">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleFinalize(journal.id)} disabled={isSubmitting}
                        className="text-xs text-green-600 hover:bg-green-50 px-1.5 py-1 rounded disabled:opacity-50" title="提交日志">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(journal.id)} className="text-red-400 hover:text-red-600 px-1.5 py-1 rounded" title="删除创建">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
