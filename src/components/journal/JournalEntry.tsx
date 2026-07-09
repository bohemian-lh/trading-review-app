import React, { useState, useEffect, useCallback } from 'react';
import { Bold, AlertTriangle, Send } from 'lucide-react';
import { useRecordsStore } from '@/stores';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import type { JournalDraft } from '@/types';

export const JournalEntry: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const { activeStages, saveDraft, getDraft, submitJournal, createSnapshot } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('stage1_left');
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [isBold, setIsBold] = useState(false);
  const [isRed, setIsRed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 加载草稿
  useEffect(() => {
    if (!selectedRecordId) return;
    const draft = getDraft(selectedRecordId);
    setSelectedStage(draft.stage);
    setSelectedStrategies(draft.strategies);
    setIsBold(draft.isBold);
    setIsRed(draft.isRed);
  }, [selectedRecordId, getDraft]);

  // 保存草稿
  const persistDraft = useCallback((partial: Partial<JournalDraft>) => {
    if (!selectedRecordId) return;
    saveDraft(selectedRecordId, {
      stage: selectedStage,
      strategies: selectedStrategies,
      isBold,
      isRed,
      ...partial,
    });
  }, [selectedRecordId, selectedStage, selectedStrategies, isBold, isRed, saveDraft]);

  const handleToggleStrategy = (strategyId: string) => {
    setSelectedStrategies(prev => {
      const next = prev.includes(strategyId) ? prev.filter(s => s !== strategyId) : [...prev, strategyId];
      persistDraft({ strategies: next });
      return next;
    });
  };

  const handleStageChange = (stage: string) => {
    setSelectedStage(stage);
    persistDraft({ stage });
  };

  const handleSubmit = async () => {
    if (!selectedRecordId) { setMessage('请先选择交易记录'); return; }
    setSubmitting(true);
    setMessage(null);
    try {
      // 1. 创建当前配置快照
      const snapshot = await createSnapshot(activeStages, datasetId);
      if (!snapshot) throw new Error('创建快照失败');
      // 2. 提交日志
      await submitJournal(
        { recordId: selectedRecordId, stage: selectedStage, strategies: selectedStrategies, isBold, isRed },
        snapshot.snapshotId,
        datasetId
      );
      setMessage('提交成功');
      setSelectedRecordId('');
      setSelectedStrategies([]);
    } catch (e: any) {
      setMessage(`提交失败: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 当前阶段的策略组
  const stageConfig = activeStages.find(s => s.stageId === selectedStage);

  // 可选的交易记录（按日期排序）
  const sortedRecords = [...records].sort((a, b) => b.openDate.localeCompare(a.openDate));

  return (
    <div className="space-y-6">
      {/* 交易记录选择 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">交易记录</label>
          <select
            value={selectedRecordId}
            onChange={(e) => setSelectedRecordId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-- 请选择一条交易记录 --</option>
            {sortedRecords.map(r => (
              <option key={r.id} value={r.id}>
                {r.openDate} | {r.stockName} ({r.stockCode})
              </option>
            ))}
          </select>
        </div>

        {/* 阶段选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">阶段</label>
          <select
            value={selectedStage}
            onChange={(e) => handleStageChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {activeStages.map(s => (
              <option key={s.stageId} value={s.stageId}>{s.stageName}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedRecordId && (
        <div className="text-center py-12 text-gray-400">请选择一条交易记录开始填写日志</div>
      )}

      {selectedRecordId && stageConfig && (
        <>
          {/* 策略组卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stageConfig.strategyGroups.map(group => (
              <StrategyCard
                key={group.groupId}
                group={group}
                selectedIds={selectedStrategies}
                onToggleStrategy={handleToggleStrategy}
              />
            ))}
          </div>

          {/* 标记 + 提交按钮 */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setIsBold(!isBold); persistDraft({ isBold: !isBold }); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${isBold ? 'bg-gray-200 text-gray-900 font-bold' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
              >
                <Bold className="h-4 w-4" />
                加粗
              </button>
              <button
                onClick={() => { setIsRed(!isRed); persistDraft({ isRed: !isRed }); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${isRed ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
              >
                <AlertTriangle className="h-4 w-4" />
                圈红
              </button>
            </div>
            <div className="flex items-center gap-3">
              {message && (
                <span className={`text-sm ${message.includes('失败') ? 'text-red-600' : 'text-green-600'}`}>
                  {message}
                </span>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                <Send className="h-4 w-4" />
                {submitting ? '提交中...' : '提交日志'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
