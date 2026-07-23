import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trash2, Link, Undo2, ArrowUpDown } from 'lucide-react';
import { useRecordsStore } from '@/stores';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { groupStrategies, applySort } from '@/utils/journalHelpers';
import type { TradingJournal } from '@/types';

// ─── 价位标签 ──────────────────────────────────────────────────────
const PRICE_LEVELS = [
  { index: 0, label: '' },
  { index: 1, label: '' },
  { index: 2, label: '目标位：' },
  { index: 3, label: '固定目标位：' },
  { index: 4, label: '压力1：' },
  { index: 5, label: '压力2：' },
  { index: 6, label: '趋势最低点：' },
];

const ROW_COLORS = ['bg-green-50', 'bg-yellow-50', 'bg-blue-50'];

// ─── localStorage 列宽 ─────────────────────────────────────────────
const COL_PREFIX = 'journal_viewer_';

interface ColSettings {
  colWidths: Record<string, number>;
}

const DEFAULT_COL: ColSettings = {
  colWidths: { name: 160, g1: 130, g2: 130, g3: 130, g4: 130, ops: 100 },
};

function loadColSettings(): ColSettings {
  try {
    const raw = localStorage.getItem(COL_PREFIX + 'settings');
    if (raw) return { ...DEFAULT_COL, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_COL };
}

function saveColSettings(s: ColSettings) {
  localStorage.setItem(COL_PREFIX + 'settings', JSON.stringify(s));
}

// ─── 匹配记录弹出面板 ──────────────────────────────────────────────
const MatchPopover: React.FC<{
  records: Array<{ id: string; openDate: string; stockName: string; stockCode: string }>;
  currentRecordId?: string;
  anchorX: number;
  anchorY: number;
  onSelect: (recordId: string | undefined) => void;
  onClose: () => void;
}> = ({ records, currentRecordId, anchorX, anchorY, onSelect, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [matchDate, setMatchDate] = useState('');
  const [matchCode, setMatchCode] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 筛选 + 排序
  const visibleRecords = useMemo(() => {
    let result = records.filter(r => {
      if (matchDate && !r.openDate.includes(matchDate.replace(/-/g, ''))) return false;
      if (matchCode && !r.stockCode.includes(matchCode)) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      const cmp = a.openDate.localeCompare(b.openDate);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [records, matchDate, matchCode, sortAsc]);

  // 计算位置，不超出视口
  const popX = Math.min(anchorX + 8, window.innerWidth - 280);
  const popY = Math.min(anchorY, window.innerHeight - 420);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64"
      style={{ left: popX, top: popY }}
    >
      <div className="text-xs font-medium text-gray-600 mb-2">关联交易记录</div>

      {/* 筛选输入 */}
      <div className="flex gap-1.5 mb-2">
        <input
          type="text"
          value={matchDate}
          onChange={e => setMatchDate(e.target.value)}
          placeholder="日期筛选"
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
        />
        <input
          type="text"
          value={matchCode}
          onChange={e => setMatchCode(e.target.value)}
          placeholder="代码筛选"
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
        />
      </div>

      {/* 排序切换 */}
      <button
        onClick={() => setSortAsc(!sortAsc)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2"
      >
        <ArrowUpDown className="h-3 w-3" />
        {sortAsc ? '开单时间升序' : '开单时间降序'}
      </button>

      {/* 不关联选项 */}
      <button
        onClick={() => onSelect(undefined)}
        className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 mb-1 ${!currentRecordId ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}
      >
        不关联
      </button>

      {/* 记录列表 */}
      <div className="max-h-48 overflow-y-auto border-t pt-1">
        {visibleRecords.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-2">无匹配记录</div>
        ) : (
          visibleRecords.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 ${
                r.id === currentRecordId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="font-medium">{r.stockName}</span>
              <span className="text-gray-400 ml-1">({r.stockCode})</span>
              <span className="text-gray-400 ml-2">{r.openDate}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

// ─── 组件 ──────────────────────────────────────────────────────────
export const JournalViewer: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const { journals, snapshots, activeStages, deleteJournal, updateJournalRecordId, revertJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  const [filterDate, setFilterDate] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [matchingJournalId, setMatchingJournalId] = useState<string | null>(null);
  const [matchAnchor, setMatchAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 列宽设置
  const [colSettings, setColSettings] = useState<ColSettings>(loadColSettings);

  // ─── 列拖拽 resize ────────────────────────────────────────────────
  const resizeState = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeState.current) return;
      const { colId, startX, startWidth } = resizeState.current;
      const newWidth = Math.max(60, startWidth + (e.clientX - startX));
      setColSettings(prev => {
        (prev.colWidths as Record<string, number>)[colId] = newWidth;
        return { ...prev };
      });
    };
    const handleMouseUp = () => {
      if (resizeState.current) {
        const current = loadColSettings();
        saveColSettings(current);
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
  }, []);

  const startResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      colId,
      startX: e.clientX,
      startWidth: colSettings.colWidths[colId] || 120,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // 策略组 ID 顺序
  const groupIds = ['g1', 'g2', 'g3', 'g4'];
  const groupNames = useMemo(() => {
    const stage = activeStages[0];
    if (!stage) return ['策略组1', '策略组2', '策略组3', '策略组4'];
    return stage.strategyGroups.map(g => g.groupName);
  }, [activeStages]);

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

  const getLinkedRecord = (journal: TradingJournal) => {
    if (!journal.recordId) return null;
    return records.find(r => r.id === journal.recordId);
  };

  // 用于匹配弹窗的记录数据
  const allRecords = useMemo(() =>
    records.map(r => ({ id: r.id, openDate: r.openDate, stockName: r.stockName, stockCode: r.stockCode })),
  [records]);

  // ─── 只读策略卡片（无交互）─────────────────────────────────────────
  const renderStrategyCard = (text: string, strategyId: string, journal: TradingJournal) => {
    const isBold = journal.strategyBold.includes(strategyId);
    const isRed = journal.strategyRed.includes(strategyId);
    const isYellow = journal.strategyYellow.includes(strategyId);
    const isRedText = journal.strategyRedText.includes(strategyId);

    let isCustom = false;
    if (journal.customStrategies) {
      for (const gid of Object.keys(journal.customStrategies)) {
        if (journal.customStrategies[gid]?.some(cs => cs.id === strategyId)) {
          isCustom = true;
          break;
        }
      }
    }

    let bgClass = '';
    if (isRed) {
      bgClass = 'bg-red-100';
    } else if (isYellow) {
      bgClass = 'bg-yellow-100';
    } else if (isCustom) {
      bgClass = 'bg-purple-50';
    } else {
      bgClass = 'bg-gray-100';
    }

    const borderClass = isCustom
      ? 'border border-dashed border-purple-300'
      : 'border border-solid border-gray-300';

    let textClass = '';
    if (isRed) {
      textClass = 'text-red-800';
    } else if (isYellow) {
      textClass = 'text-yellow-800';
    } else if (isRedText) {
      textClass = 'text-red-600';
    } else if (isCustom) {
      textClass = 'text-purple-700';
    } else {
      textClass = 'text-gray-700';
    }

    return (
      <span
        key={strategyId}
        className={`px-1.5 py-0.5 rounded text-xs ${bgClass} ${borderClass} ${textClass} ${isBold ? 'font-bold' : ''}`}
      >
        {text}
      </span>
    );
  };

  // 列配置
  const columns = [
    { id: 'name', label: '股票名称' },
    ...groupIds.map((gid, i) => ({ id: gid, label: groupNames[i] || gid })),
    { id: 'ops', label: '操作' },
  ];

  if (filtered.length === 0) {
    return (
      <div>
        <div className="flex gap-4 mb-6">
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
        <div className="text-center py-12 text-gray-400">
          {journals.filter(j => j.status === 'submitted').length === 0 ? '暂无已提交的日志' : '无匹配结果'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg bg-gray-100" style={{ padding: '4px' }}>
        <table className="border-separate text-sm" style={{ tableLayout: 'fixed', borderSpacing: '0 4px' }}>
          <thead>
            <tr className="bg-gray-50">
              {columns.map(col => {
                const w = colSettings.colWidths[col.id] || 120;
                const isOps = col.id === 'ops';
                return (
                  <th
                    key={col.id}
                    className={`px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 bg-gray-50 relative ${isOps ? 'text-center' : 'text-left'}`}
                    style={{ width: `${w}px`, minWidth: `${w}px` }}
                  >
                    <span className="truncate block">{col.label}</span>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors"
                      onMouseDown={(e) => startResize(col.id, e)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((journal, idx) => {
              const grouped = groupStrategies(journal, activeStages, snapshots);
              const stageName = activeStages.find(s => s.stageId === journal.stage)?.stageName || journal.stage;
              const linkedRecord = getLinkedRecord(journal);
              const rowColor = ROW_COLORS[idx % ROW_COLORS.length];

              return (
                <tr key={journal.id} className={`${rowColor} transition-colors`}>
                  <td className="px-3 py-1 border border-gray-200 align-top">
                    <div className="text-xs font-medium">
                      {journal.stockName || '-'} ({journal.stockCode || '-'})
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {journal.openDate || '-'} | {stageName}
                    </div>
                    <div className="text-xs mt-0.5">
                      {linkedRecord ? (
                        <span className="text-green-600">
                          已关联: {linkedRecord.stockName}({linkedRecord.stockCode})
                        </span>
                      ) : (
                        <span className="text-orange-400">未关联</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      提交于 {new Date(journal.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1.5">
                      {PRICE_LEVELS.map(pl => {
                        const userValue = (journal.priceLevels || [])[pl.index] || '';
                        const hasValue = !!userValue;
                        const displayText = pl.label
                          ? (hasValue ? pl.label + userValue : pl.label)
                          : (hasValue ? userValue : null);

                        if (!displayText) return null;

                        return (
                          <div
                            key={pl.index}
                            className={`text-xs px-1 py-0.5 rounded ${
                              hasValue
                                ? 'border border-solid border-blue-200 bg-blue-50 text-blue-800'
                                : 'border border-dashed border-gray-200 text-gray-400'
                            }`}
                          >
                            {displayText}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  {groupIds.map(gid => {
                    const items = applySort(grouped[gid] || [], journal.strategyOrder[gid]);
                    return (
                      <td key={gid} className="px-3 py-1 border border-gray-200 align-top text-xs">
                        {items.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {items.map(item => renderStrategyCard(item.text, item.strategyId, journal))}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center border border-gray-200 align-top">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button
                        onClick={(e) => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setMatchAnchor({ x: rect.right + 4, y: rect.top });
                          setMatchingJournalId(journal.id);
                        }}
                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50"
                        title="匹配记录"
                      >
                        <Link className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRevert(journal.id)}
                        className="text-orange-400 hover:text-orange-600 p-1 rounded hover:bg-orange-50"
                        title="回退到当前交易"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(journal.id)}
                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                        title="删除日志"
                      >
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

      {/* 匹配记录弹窗 */}
      {matchingJournalId && (
        <MatchPopover
          records={allRecords}
          currentRecordId={journals.find(j => j.id === matchingJournalId)?.recordId}
          anchorX={matchAnchor.x}
          anchorY={matchAnchor.y}
          onSelect={(recordId) => handleMatch(matchingJournalId, recordId)}
          onClose={() => setMatchingJournalId(null)}
        />
      )}
    </div>
  );
};
