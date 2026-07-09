import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Bold, AlertTriangle, Sun, Send, Trash2, Edit2, X, Settings } from 'lucide-react';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import type { TradingJournal } from '@/types';

// ─── localStorage UI 设置 ──────────────────────────────────────────
const UI_PREFIX = 'journal_table_';

interface TableSettings {
  showOps: boolean;
  colWidths: Record<string, number>;
  fontSizes: Record<string, number>;
}

const DEFAULT_SETTINGS: TableSettings = {
  showOps: true,
  colWidths: { name: 120, g1: 120, g2: 120, g3: 120, g4: 120, ops: 90 },
  fontSizes: { name: 13, g1: 12, g2: 12, g3: 12, g4: 12 },
};

function loadSettings(): TableSettings {
  try {
    const raw = localStorage.getItem(UI_PREFIX + 'settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: TableSettings) {
  localStorage.setItem(UI_PREFIX + 'settings', JSON.stringify(s));
}

// ─── 策略分组 helper ───────────────────────────────────────────────
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

// ─── 列配置 ────────────────────────────────────────────────────────
const COLUMNS = [
  { id: 'name', label: '股票名称' },
  { id: 'g1', label: '' },
  { id: 'g2', label: '' },
  { id: 'g3', label: '' },
  { id: 'g4', label: '' },
] as const;

const FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24];

// ─── 组件 ──────────────────────────────────────────────────────────
export const JournalDrafts: React.FC = () => {
  const { journals, snapshots, activeStages, createSnapshot, finalizeJournal, updateDraftJournal, deleteJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { stage: string; strategies: string[]; isBold: boolean; isRed: boolean; isYellow: boolean }>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  // UI 设置
  const [settings, setSettings] = useState<TableSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  const drafts = journals.filter(j => j.status === 'draft');

  // 策略组 ID 顺序
  const groupIds = ['g1', 'g2', 'g3', 'g4'];
  const groupNames = useMemo(() => {
    const stage = activeStages[0];
    if (!stage) return ['策略组1', '策略组2', '策略组3', '策略组4'];
    return stage.strategyGroups.map(g => g.groupName);
  }, [activeStages]);

  // 持久化设置变更
  const updateSettings = useCallback((patch: Partial<TableSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ─── 列拖拽 resize ────────────────────────────────────────────
  const resizeState = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeState.current) return;
      const { colId, startX, startWidth } = resizeState.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      setSettings(prev => ({ ...prev, colWidths: { ...prev.colWidths, [colId]: newWidth } }));
    };
    const handleMouseUp = () => {
      if (resizeState.current) {
        saveSettings({ ...loadSettings(), colWidths: settings.colWidths });
        resizeState.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [settings.colWidths]);

  const startResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      colId,
      startX: e.clientX,
      startWidth: settings.colWidths[colId] || 120,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ─── 编辑逻辑 ─────────────────────────────────────────────────
  const startEditing = (j: TradingJournal) => {
    setEditingId(j.id);
    setEditState(prev => ({
      ...prev,
      [j.id]: { stage: j.stage, strategies: [...j.strategies], isBold: j.isBold, isRed: j.isRed, isYellow: j.isYellow },
    }));
  };

  const cancelEditing = () => setEditingId(null);

  const getEditState = (id: string) => editState[id] || { stage: '', strategies: [], isBold: false, isRed: false, isYellow: false };

  const updateEditState = (id: string, patch: Partial<typeof editState[string]>) => {
    setEditState(prev => {
      const prevState = prev[id] || { stage: '', strategies: [], isBold: false, isRed: false, isYellow: false };
      const merged = { ...prevState, ...patch };
      // 标红和标黄互斥
      if (patch.isRed && !prevState.isRed) merged.isYellow = false;
      if (patch.isYellow && !prevState.isYellow) merged.isRed = false;
      return { ...prev, [id]: merged };
    });
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
      isBold: es.isBold,
      isRed: es.isRed,
      isYellow: es.isYellow,
    }, datasetId);
    setEditingId(null);
  };

  const handleFinalize = async (journalId: string) => {
    if (!confirm('确认提交此条日志？提交后将移至「已存储日志」。')) return;
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

  // ─── 快速切换样式（compact 视图直接 toggle，标红/标黄互斥）─────────
  const handleQuickToggle = async (journalId: string, field: 'isBold' | 'isRed' | 'isYellow') => {
    const journal = journals.find(j => j.id === journalId);
    if (!journal) return;
    if (field === 'isRed' && !journal.isRed) {
      await updateDraftJournal(journalId, { isRed: true, isYellow: false }, datasetId);
    } else if (field === 'isYellow' && !journal.isYellow) {
      await updateDraftJournal(journalId, { isYellow: true, isRed: false }, datasetId);
    } else {
      await updateDraftJournal(journalId, { [field]: !journal[field] }, datasetId);
    }
  };

  const stageOptions = activeStages;

  // ─── 渲染行样式 ───────────────────────────────────────────────
  const getCellStyle = (colId: string): React.CSSProperties => {
    const fs = settings.fontSizes[colId] || 12;
    return { fontSize: `${fs}px` };
  };

  const getCompactCellStyle = (j: TradingJournal, colId: string): React.CSSProperties => {
    return {
      ...getCellStyle(colId),
      fontWeight: j.isBold ? 700 : undefined,
      backgroundColor: j.isRed ? '#fee2e2' : j.isYellow ? '#fef08a' : undefined,
    };
  };

  // ─── 可见列 ───────────────────────────────────────────────────
  const visibleCols = COLUMNS;

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        暂无当前交易，请先在「填写提交」中创建
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ─── 头部：计数 + 设置 ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{drafts.length} 条当前交易</div>
        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${showSettings ? 'bg-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Settings className="h-3.5 w-3.5" />
            表格设置
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-3 space-y-3">
              {/* 操作列显隐 */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-600">显示操作列</span>
                <button
                  onClick={() => updateSettings({ showOps: !settings.showOps })}
                  className={`w-8 h-4 rounded-full transition-colors ${settings.showOps ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${settings.showOps ? 'translate-x-3.5' : ''}`} />
                </button>
              </label>

              <div className="border-t pt-2">
                <div className="text-xs text-gray-500 mb-2">每列字号</div>
                {[{ id: 'name', label: '股票名称' }, { id: 'g1', label: groupNames[0] }, { id: 'g2', label: groupNames[1] }, { id: 'g3', label: groupNames[2] }, { id: 'g4', label: groupNames[3] }].map(col => (
                  <div key={col.id} className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 truncate mr-2 max-w-[120px]">{col.label}</span>
                    <select
                      value={settings.fontSizes[col.id] || 12}
                      onChange={(e) => updateSettings({ fontSizes: { ...settings.fontSizes, [col.id]: Number(e.target.value) } })}
                      className="text-xs border rounded px-1.5 py-0.5"
                    >
                      {FONT_SIZE_OPTIONS.map(n => (
                        <option key={n} value={n}>{n}px</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  updateSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                恢复默认
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── 表格式列表 ──────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="border border-gray-200 rounded-lg overflow-hidden text-sm" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-gray-50 relative">
              {visibleCols.map(col => {
                const colName = col.id === 'name' ? col.label : (groupNames[parseInt(col.id.slice(1)) - 1] || col.id);
                const width = settings.colWidths[col.id] || 120;
                return (
                  <th
                    key={col.id}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-r relative"
                    style={{ width: `${width}px`, minWidth: `${width}px` }}
                  >
                    <span className="truncate block">{colName}</span>
                    {/* 拖拽手柄 */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors"
                      onMouseDown={(e) => startResize(col.id, e)}
                    />
                  </th>
                );
              })}
              {settings.showOps && (
                <th
                  className="px-3 py-2 text-center text-xs font-medium text-gray-500 relative"
                  style={{ width: `${settings.colWidths.ops || 90}px`, minWidth: `${settings.colWidths.ops || 90}px` }}
                >
                  操作
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors"
                    onMouseDown={(e) => startResize('ops', e)}
                  />
                </th>
              )}
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

              // 编辑模式
              if (isEditing) {
                return (
                  <React.Fragment key={journal.id}>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 border-r text-gray-900 font-medium" colSpan={visibleCols.length + (settings.showOps ? 1 : 0)}>
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
                      <td className="px-3 py-3" colSpan={visibleCols.length + (settings.showOps ? 1 : 0)}>
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
                                <AlertTriangle className="h-3.5 w-3.5" />标红</button>
                              <button onClick={() => updateEditState(journal.id, { isYellow: !es.isYellow })}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${es.isYellow ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                <Sun className="h-3.5 w-3.5" />标黄</button>
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

              // 紧凑模式
              return (
                <tr key={journal.id} className="border-b transition-colors">
                  <td className="px-3 py-1 border-r align-top" style={getCompactCellStyle(journal, 'name')}>
                    {journal.stockName || '-'}
                  </td>
                  {groupIds.map(gid => {
                    const items = grouped[gid] || [];
                    return (
                      <td key={gid} className="px-3 py-1 border-r align-top" style={getCompactCellStyle(journal, gid)}>
                        {items.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {items.map((text, i) => (
                              <span key={i}>{text}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  {settings.showOps && (
                    <td className="px-2 py-1 text-center" style={getCompactCellStyle(journal, 'ops')}>
                      <div className="flex items-center justify-center gap-0.5 flex-wrap">
                        <button onClick={() => handleQuickToggle(journal.id, 'isBold')}
                          className={`p-1 rounded ${journal.isBold ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:bg-gray-100'}`} title="加粗">
                          <Bold className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleQuickToggle(journal.id, 'isRed')}
                          className={`p-1 rounded ${journal.isRed ? 'bg-red-200 text-red-700' : 'text-gray-400 hover:bg-red-50'}`} title="标红">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleQuickToggle(journal.id, 'isYellow')}
                          className={`p-1 rounded ${journal.isYellow ? 'bg-yellow-200 text-yellow-700' : 'text-gray-400 hover:bg-yellow-50'}`} title="标黄">
                          <Sun className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => startEditing(journal)} className="text-xs text-blue-600 hover:bg-blue-50 p-1 rounded" title="编辑策略">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleFinalize(journal.id)} disabled={isSubmitting}
                          className="text-xs text-green-600 hover:bg-green-50 p-1 rounded disabled:opacity-50" title="提交日志">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(journal.id)} className="text-red-400 hover:text-red-600 p-1 rounded" title="删除创建">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 点击空白处关闭设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)} />
      )}
    </div>
  );
};
