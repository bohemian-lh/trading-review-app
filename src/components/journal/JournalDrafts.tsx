import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Bold, AlertTriangle, Sun, Send, Trash2, Edit2, X, Settings, Maximize, Minimize, Download } from 'lucide-react';
import { useJournalStore } from '@/stores/journalStore';
import { useDatasetStore } from '@/stores/datasetStore';
import { StrategyCard } from './StrategyCard';
import { JournalRow } from '@/utils/JournalPdfDocument';
import PdfPreviewModal from './PdfPreviewModal';
import { groupStrategies, type StrategyItem, applySort, extractNumbers, getClosePrice, computeGainText, GAIN_PRICE_INDEXES } from '@/utils/journalHelpers';
import type { TradingJournal, CustomStrategy } from '@/types';

// ─── 简易 ID 生成 ────────────────────────────────────────────────
let _idCounter = 0;
const genId = () => `cs_${Date.now().toString(36)}_${++_idCounter}`;

// ─── localStorage UI 设置 ──────────────────────────────────────────
const UI_PREFIX = 'journal_table_';

interface TableSettings {
  showOps: boolean;
  colWidths: Record<string, number>;
  fontSizes: Record<string, number>;
  rowGaps: Record<string, number>;
  rowSpacing: number;
}

const DEFAULT_SETTINGS: TableSettings = {
  showOps: true,
  colWidths: { name: 120, g1: 120, g2: 120, g3: 120, g4: 120, ops: 120 },
  fontSizes: { name: 13, g1: 12, g2: 12, g3: 12, g4: 12 },
  rowGaps: { g1: 4, g2: 4, g3: 4, g4: 4 },
  rowSpacing: 4,
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

// ─── 列配置 ────────────────────────────────────────────────────────
const COLUMNS = [
  { id: 'name', label: '股票名称' },
  { id: 'g1', label: '' },
  { id: 'g2', label: '' },
  { id: 'g3', label: '' },
  { id: 'g4', label: '' },
] as const;

const FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24];
const ROW_SPACING_OPTIONS = [2, 3, 4, 5, 6, 8, 10];
const ROW_COLORS = ['bg-green-50', 'bg-yellow-50', 'bg-blue-50'];

const PRICE_LEVELS = [
  { index: 0, label: '' },
  { index: 1, label: '' },
  { index: 2, label: '目标位：' },
  { index: 3, label: '固定目标位：' },
  { index: 4, label: '压力1：' },
  { index: 5, label: '压力2：' },
  { index: 6, label: '趋势最低点：' },
];

// ─── Popover 组件 ──────────────────────────────────────────────────
const StrategyPopover: React.FC<{
  x: number;
  y: number;
  isBold: boolean;
  isRed: boolean;
  isYellow: boolean;
  isRedText: boolean;
  onToggle: (field: 'strategyBold' | 'strategyRed' | 'strategyYellow' | 'strategyRedText') => void;
  onClose: () => void;
}> = ({ x, y, isBold, isRed, isYellow, isRedText, onToggle, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟绑定避免触发点击事件的同一事件关闭 popover
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 限制 popover 不超出视口
  const adjustedX = Math.min(x, window.innerWidth - 160);
  const adjustedY = Math.min(y, window.innerHeight - 140);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-36"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="space-y-1">
        <button
          onClick={() => onToggle('strategyBold')}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ${isBold ? 'bg-gray-200 text-gray-900 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Bold className="h-3.5 w-3.5" />加粗
        </button>
        <button
          onClick={() => onToggle('strategyRed')}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ${isRed ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:bg-red-50'}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />标红
        </button>
        <button
          onClick={() => onToggle('strategyYellow')}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ${isYellow ? 'bg-yellow-100 text-yellow-700' : 'text-gray-600 hover:bg-yellow-50'}`}
        >
          <Sun className="h-3.5 w-3.5" />标黄
        </button>
        <button
          onClick={() => onToggle('strategyRedText')}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ${isRedText ? 'bg-red-50 text-red-600 font-semibold' : 'text-gray-600 hover:bg-red-50'}`}
        >
          <span className="h-3.5 w-3.5 flex items-center justify-center text-red-500 font-bold text-sm">A</span>红字
        </button>
      </div>
    </div>
  );
};

// ─── 组件 ──────────────────────────────────────────────────────────
export const JournalDrafts: React.FC = () => {
  const { journals, snapshots, activeStages, createSnapshot, finalizeJournal, updateDraftJournal, deleteJournal } = useJournalStore();
  const datasetId = useDatasetStore(s => s.currentDatasetId) || 'default';

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  type EditStateEntry = {
    stage: string;
    strategies: string[];
    customStrategies: Record<string, CustomStrategy[]>;
    stageStrategies: Record<string, string[]>;
    stageCustomStrategies: Record<string, Record<string, CustomStrategy[]>>;
  };
  const [editState, setEditState] = useState<Record<string, EditStateEntry>>({});
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  // Popover 状态
  const [popover, setPopover] = useState<{ journalId: string; strategyId: string; x: number; y: number } | null>(null);

  // ─── 拖拽排序 ─────────────────────────────────────────────────
  const [dragState, setDragState] = useState<{
    journalId: string;
    groupId: string;
    strategyId: string;
    overId: string | null;
  } | null>(null);

  // 价位卡片内联编辑状态
  const [editingPrice, setEditingPrice] = useState<{ journalId: string; index: number } | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // UI 设置
  const [settings, setSettings] = useState<TableSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 监听全屏变化
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await tableContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const drafts = journals.filter(j => j.status === 'draft');

  // 策略组 ID 顺序
  const groupIds = ['g1', 'g2', 'g3', 'g4'];
  const groupNames = useMemo(() => {
    const stage = activeStages[0];
    if (!stage) return ['策略组1', '策略组2', '策略组3', '策略组4'];
    return stage.strategyGroups.map(g => g.groupName);
  }, [activeStages]);

  // 导出/预览用的行数据（过滤无策略内容的行）
  const exportRows = useMemo<JournalRow[]>(() => {
    return drafts.map(j => {
      const grp = groupStrategies(j, activeStages, snapshots);
      const sorted = { ...grp };
      for (const gid of groupIds) {
        sorted[gid] = applySort(grp[gid] || [], j.strategyOrder[gid]);
      }
      return { journal: j, grouped: sorted };
    }).filter(row => groupIds.some(gid => (row.grouped[gid] || []).length > 0));
  }, [drafts, activeStages, snapshots, groupIds]);

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
      [j.id]: {
        stage: j.stage,
        strategies: [...j.strategies],
        customStrategies: { ...j.customStrategies },
        stageStrategies: { ...j.stageStrategies, [j.stage]: [...j.strategies] },
        stageCustomStrategies: { ...j.stageCustomStrategies },
      },
    }));
  };

  const cancelEditing = () => setEditingId(null);

  const getEditState = (id: string): EditStateEntry =>
    editState[id] || { stage: '', strategies: [], customStrategies: {}, stageStrategies: {}, stageCustomStrategies: {} };

  const updateEditState = (id: string, patch: Partial<EditStateEntry>) => {
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
    // 保存当前阶段的策略到 stageStrategies
    const finalStageStrategies = { ...es.stageStrategies, [es.stage]: [...es.strategies] };
    const finalStageCustoms = { ...es.stageCustomStrategies, [es.stage]: { ...es.customStrategies } };
    const snapshot = await createSnapshot(activeStages, datasetId);
    if (!snapshot) return;
    await updateDraftJournal(journalId, {
      stage: es.stage,
      strategies: es.strategies,
      customStrategies: es.customStrategies,
      stageStrategies: finalStageStrategies,
      stageCustomStrategies: finalStageCustoms,
      snapshotId: snapshot.snapshotId,
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

  // ─── 价位卡片内联编辑 ────────────────────────────────────────
  const startEditingPrice = (journalId: string, index: number, currentValue: string) => {
    setEditingPrice({ journalId, index });
    setEditingPriceValue(currentValue);
  };

  const savePriceLevel = async (journalId: string, index: number) => {
    const journal = journals.find(j => j.id === journalId);
    if (!journal) return;
    const newLevels = [...journal.priceLevels];
    newLevels[index] = editingPriceValue;

    // 趋势最低点（index 6）变更时，自动计算固定目标位（index 3）和第一硬止损位（index 1）
    if (index === 6) {
      const oldNums = extractNumbers(journal.priceLevels?.[6] || '');
      const newNums = extractNumbers(editingPriceValue);

      if (newNums.length === 0) {
        // 清空趋势最低价：同步清理自动计算的 index 1 / index 3
        newLevels[1] = '';
        newLevels[3] = '';
      } else {
        // 仅当 a/b/c（前三个数字）变化时才重算，避免补/改今日收盘价 d 时覆盖手调值
        const abcChanged =
          oldNums[0] !== newNums[0] ||
          oldNums[1] !== newNums[1] ||
          oldNums[2] !== newNums[2];

        if (abcChanged) {
          if (newNums.length >= 1) {
            // 第一硬止损位 = a * 0.98
            newLevels[1] = (newNums[0] * 0.98).toFixed(2);
          }
          if (newNums.length === 1) {
            // 单值：默认系数 1.08 / 1.10
            const lower = newNums[0] * 1.08;
            const upper = newNums[0] * 1.10;
            newLevels[3] = `${lower.toFixed(2)} -- ${upper.toFixed(2)}`;
          } else if (newNums.length >= 3) {
            // 三值及以上：第一个为基准价，后两个为系数百分比（如 10→1.10, 15→1.15）
            // 四值 (a,b,c,d) 时 d 为今日收盘价，仅用于涨幅计算，不参与系数
            const trendLow = newNums[0];
            const coefLower = 1 + newNums[1] / 100;
            const coefUpper = 1 + newNums[2] / 100;
            const lower = trendLow * coefLower;
            const upper = trendLow * coefUpper;
            newLevels[3] = `${lower.toFixed(2)} -- ${upper.toFixed(2)}`;
          }
          // 其他情况回退默认，不修改 index 3
        }
      }
    }

    setEditingPrice(null);
    await updateDraftJournal(journalId, { priceLevels: newLevels }, datasetId);
  };

  const cancelEditingPrice = () => {
    setEditingPrice(null);
  };

  // ─── 策略级样式 toggle（标红/标黄互斥）─────────────────────────
  const handleStrategyToggle = async (
    journalId: string,
    strategyId: string,
    field: 'strategyBold' | 'strategyRed' | 'strategyYellow' | 'strategyRedText'
  ) => {
    const journal = journals.find(j => j.id === journalId);
    if (!journal) return;
    const enabled = journal[field].includes(strategyId);
    const patch: Partial<TradingJournal> = {};

    if (field === 'strategyBold') {
      patch.strategyBold = enabled
        ? journal.strategyBold.filter(s => s !== strategyId)
        : [...journal.strategyBold, strategyId];
    } else if (field === 'strategyRed') {
      patch.strategyRed = enabled
        ? journal.strategyRed.filter(s => s !== strategyId)
        : [...journal.strategyRed, strategyId];
      if (!enabled) {
        // 开启标红时关闭标黄
        patch.strategyYellow = journal.strategyYellow.filter(s => s !== strategyId);
        // 开启标红时关闭红字（标红 ↔ 红字互斥）
        patch.strategyRedText = journal.strategyRedText.filter(s => s !== strategyId);
      }
    } else if (field === 'strategyYellow') {
      patch.strategyYellow = enabled
        ? journal.strategyYellow.filter(s => s !== strategyId)
        : [...journal.strategyYellow, strategyId];
      if (!enabled) {
        // 开启标黄时关闭标红
        patch.strategyRed = journal.strategyRed.filter(s => s !== strategyId);
      }
    } else if (field === 'strategyRedText') {
      patch.strategyRedText = enabled
        ? journal.strategyRedText.filter(s => s !== strategyId)
        : [...journal.strategyRedText, strategyId];
      if (!enabled) {
        // 开启红字时关闭标红（红字 ↔ 标红互斥）
        patch.strategyRed = journal.strategyRed.filter(s => s !== strategyId);
      }
    }

    await updateDraftJournal(journalId, patch, datasetId);
    setPopover(null);
  };

  const stageOptions = activeStages;

  // ─── 渲染行样式（仅字号）───────────────────────────────────────
  const getCellStyle = (colId: string): React.CSSProperties => {
    const fs = settings.fontSizes[colId] || 12;
    return { fontSize: `${fs}px` };
  };

  // ─── 策略卡片渲染 ─────────────────────────────────────────────
  const renderStrategyCard = (
    item: StrategyItem,
    journal: TradingJournal,
    gid: string,
  ) => {
    const sid = item.strategyId;
    const isBold = journal.strategyBold.includes(sid);
    const isRed = journal.strategyRed.includes(sid);
    const isYellow = journal.strategyYellow.includes(sid);
    const isRedText = journal.strategyRedText.includes(sid);
    const isCustom = item.isCustom;

    // 背景
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

    // 边框：预设策略实体线框，自定义策略虚线框
    const borderClass = isCustom
      ? 'border border-dashed border-purple-300'
      : 'border border-solid border-gray-300';

    // 文字颜色
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

    const boldClass = isBold ? 'font-bold' : '';

    // 拖拽状态
    const isDragging = dragState?.strategyId === sid && dragState?.journalId === journal.id;
    const isDragOver = dragState?.overId === sid && dragState?.journalId === journal.id && dragState?.groupId === gid;

    return (
      <span
        key={sid}
        draggable
        className={`px-1.5 py-0.5 rounded cursor-pointer hover:ring-1 hover:ring-blue-300 ${bgClass} ${borderClass} ${textClass} ${boldClass} ${
          isDragging ? 'opacity-30' : ''
        } ${isDragOver ? 'ring-2 ring-blue-400' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setPopover({ journalId: journal.id, strategyId: sid, x: e.clientX, y: e.clientY + 4 });
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', sid);
          setDragState({ journalId: journal.id, groupId: gid, strategyId: sid, overId: null });
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragState?.journalId === journal.id && dragState?.groupId === gid && dragState?.strategyId !== sid) {
            setDragState(prev => prev ? { ...prev, overId: sid } : null);
          }
        }}
        onDragLeave={() => {
          setDragState(prev => prev && prev.overId === sid ? { ...prev, overId: null } : prev);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragState || dragState.journalId !== journal.id || dragState.groupId !== gid || dragState.strategyId === sid) {
            setDragState(null);
            return;
          }
          // 重新排序
          const currentOrder = journal.strategyOrder[gid] || [];
          // 从全量策略列表构建当前顺序
          const allInGroup = groupStrategies(journal, activeStages, snapshots)[gid] || [];
          const allIds = allInGroup.map(i => i.strategyId);
          // 合并自定义顺序
          let ordered = currentOrder.length > 0
            ? [...currentOrder.filter(id => allIds.includes(id)), ...allIds.filter(id => !currentOrder.includes(id))]
            : allIds;
          // 移除被拖拽项
          ordered = ordered.filter(id => id !== dragState.strategyId);
          // 插入到 over 位置
          const overIdx = ordered.indexOf(sid);
          ordered.splice(overIdx >= 0 ? overIdx : ordered.length, 0, dragState.strategyId);
          const newOrder = { ...journal.strategyOrder, [gid]: ordered };
          setDragState(null);
          await updateDraftJournal(journal.id, { strategyOrder: newOrder }, datasetId);
        }}
        onDragEnd={() => {
          setDragState(null);
        }}
      >
        {item.text}
      </span>
    );
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
      {!isFullscreen && (
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{drafts.length} 条当前交易</div>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => {
              setExportError(null);
              setShowPdfPreview(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors text-gray-500 hover:bg-gray-100"
            title="预览/导出PDF"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors text-gray-500 hover:bg-gray-100"
            title="全屏"
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
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

              <div className="border-t pt-2">
                <div className="text-xs text-gray-500 mb-2">策略组行距</div>
                {[{ id: 'g1', label: groupNames[0] }, { id: 'g2', label: groupNames[1] }, { id: 'g3', label: groupNames[2] }, { id: 'g4', label: groupNames[3] }].map(col => (
                  <div key={col.id} className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 truncate mr-2 max-w-[120px]">{col.label}</span>
                    <select
                      value={settings.rowGaps[col.id] || 4}
                      onChange={(e) => updateSettings({ rowGaps: { ...settings.rowGaps, [col.id]: Number(e.target.value) } })}
                      className="text-xs border rounded px-1.5 py-0.5"
                    >
                      {[0, 2, 4, 6, 8, 10, 12, 16].map(n => (
                        <option key={n} value={n}>{n}px</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="border-t pt-2">
                <div className="text-xs text-gray-500 mb-2">行间距</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">行与行间距</span>
                  <select
                    value={settings.rowSpacing}
                    onChange={(e) => updateSettings({ rowSpacing: Number(e.target.value) })}
                    className="text-xs border rounded px-1.5 py-0.5"
                  >
                    {ROW_SPACING_OPTIONS.map(n => (
                      <option key={n} value={n}>{n}px</option>
                    ))}
                  </select>
                </div>
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
      )}

      {/* 导出错误提示 */}
      {exportError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{exportError}</span>
          <button onClick={() => setExportError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── 表格式列表 ──────────────────────────────────────── */}
      <div ref={tableContainerRef} className={`overflow-x-auto rounded-lg ${isFullscreen ? 'h-screen flex flex-col bg-white p-4' : 'bg-gray-100'}`} style={isFullscreen ? undefined : { padding: `${settings.rowSpacing}px` }}>
        {isFullscreen && (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <span className="text-sm font-medium text-gray-700">{drafts.length} 条当前交易</span>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors text-gray-500 hover:bg-gray-100"
            >
              <Minimize className="h-3.5 w-3.5" />
              退出全屏
            </button>
          </div>
        )}
        <table className={`border-separate text-sm ${isFullscreen ? 'flex-1' : ''}`} style={{ tableLayout: 'fixed', borderSpacing: `0 ${settings.rowSpacing}px` }}>
          <thead>
            <tr className="bg-gray-50 relative">
              {visibleCols.map(col => {
                const colName = col.id === 'name' ? col.label : (groupNames[parseInt(col.id.slice(1)) - 1] || col.id);
                const width = settings.colWidths[col.id] || 120;
                return (
                  <th
                    key={col.id}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200 bg-gray-50 relative"
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
                  className="px-3 py-2 text-center text-xs font-medium text-gray-500 border border-gray-200 bg-gray-50 relative"
                  style={{ width: `${settings.colWidths.ops || 120}px`, minWidth: `${settings.colWidths.ops || 120}px` }}
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
            {drafts.map((journal, idx) => {
              const grouped = groupStrategies(journal, activeStages, snapshots);
              const isSubmitting = submittingIds.has(journal.id);
              const isEditing = editingId === journal.id;
              const es = getEditState(journal.id);
              const currentStage = isEditing ? es.stage : journal.stage;
              const currentStrategies = isEditing ? es.strategies : journal.strategies;
              const stageConfig = activeStages.find(s => s.stageId === currentStage);
              const rowColor = ROW_COLORS[idx % ROW_COLORS.length];

              // 编辑模式
              if (isEditing) {
                return (
                  <React.Fragment key={journal.id}>
                    <tr className={rowColor}>
                      <td className="px-3 py-2 border border-gray-200 text-gray-900 font-medium" colSpan={visibleCols.length + (settings.showOps ? 1 : 0)}>
                        <span>编辑: {journal.stockName || '-'} ({journal.stockCode || '-'}) - {journal.openDate}</span>
                      </td>
                    </tr>
                    <tr className={rowColor}>
                      <td className="px-3 py-3 border border-gray-200" colSpan={visibleCols.length + (settings.showOps ? 1 : 0)}>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">阶段</label>
                            <select value={es.stage} onChange={(e) => {
                              const newStage = e.target.value;
                              const oldStage = es.stage;
                              // 保存当前阶段的策略
                              const newStageStrategies = { ...es.stageStrategies, [oldStage]: [...es.strategies] };
                              const newStageCustoms = { ...es.stageCustomStrategies, [oldStage]: { ...es.customStrategies } };
                              // 切换到新阶段：恢复该阶段之前保存的策略
                              updateEditState(journal.id, {
                                stage: newStage,
                                strategies: [...(newStageStrategies[newStage] || [])],
                                customStrategies: { ...(newStageCustoms[newStage] || {}) },
                                stageStrategies: newStageStrategies,
                                stageCustomStrategies: newStageCustoms,
                              });
                            }}
                              className="w-full rounded border border-gray-300 px-3 py-2 text-sm">{/* stageOptions remains below */}
                              {stageOptions.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
                            </select>
                          </div>
                          {stageConfig && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {stageConfig.strategyGroups.map(group => (
                                  <StrategyCard key={group.groupId} group={group} selectedIds={currentStrategies}
                                    onToggleStrategy={(sid) => handleToggleStrategy(journal.id, sid)} />
                                ))}
                              </div>
                              {/* 自定义策略：每个策略组多个输入框 */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {stageConfig.strategyGroups.map(group => {
                                  const groupCustoms = es.customStrategies[group.groupId] || [];
                                  return (
                                    <div key={`custom_${group.groupId}`} className="border border-dashed border-purple-300 rounded-lg p-3 bg-purple-50/30">
                                      <label className="block text-xs font-medium text-purple-600 mb-2">
                                        自定义策略 — {group.groupName}
                                      </label>
                                      <div className="space-y-2">
                                        {groupCustoms.map((cs, idx) => (
                                          <div key={cs.id} className="flex items-center gap-1">
                                            <input
                                              type="text"
                                              value={cs.text}
                                              onChange={(e) => {
                                                const updated = groupCustoms.map((item, i) =>
                                                  i === idx ? { ...item, text: e.target.value } : item
                                                );
                                                updateEditState(journal.id, {
                                                  customStrategies: { ...es.customStrategies, [group.groupId]: updated }
                                                });
                                              }}
                                              placeholder="输入自定义策略..."
                                              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                                            />
                                            <button
                                              onClick={() => {
                                                const updated = groupCustoms.filter((_, i) => i !== idx);
                                                updateEditState(journal.id, {
                                                  customStrategies: { ...es.customStrategies, [group.groupId]: updated }
                                                });
                                              }}
                                              className="text-gray-400 hover:text-red-500 p-1"
                                            >
                                              <X className="h-4 w-4" />
                                            </button>
                                          </div>
                                        ))}
                                        <button
                                          onClick={() => {
                                            const newCs: CustomStrategy = { id: genId(), text: '' };
                                            updateEditState(journal.id, {
                                              customStrategies: { ...es.customStrategies, [group.groupId]: [...groupCustoms, newCs] }
                                            });
                                          }}
                                          className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                                        >
                                          ＋ 新增自定义策略
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                          <div className="flex items-center justify-end pt-3 border-t gap-2">
                            <button onClick={cancelEditing} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">
                              取消
                            </button>
                            <button onClick={() => handleSaveEdit(journal.id)} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700">
                              保存编辑
                            </button>
                            <button onClick={() => handleFinalize(journal.id)} disabled={isSubmitting}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs font-medium">
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
                <tr key={journal.id} className={`${rowColor} transition-colors`}>
                  <td className="px-3 py-1 border border-gray-200 align-top" style={getCellStyle('name')}>
                    {journal.stockName || '-'}
                    <div className="flex flex-col gap-0.5 mt-1">
                      {PRICE_LEVELS.map(pl => {
                        const userValue = (journal.priceLevels || [])[pl.index] || '';
                        const isEditingPrice = editingPrice?.journalId === journal.id && editingPrice?.index === pl.index;
                        const hasValue = !!userValue;
                        const closePrice = getClosePrice(journal.priceLevels || []);
                        const gain = GAIN_PRICE_INDEXES.includes(pl.index) ? computeGainText(userValue, closePrice) : null;
                        const displayText = pl.label
                          ? (hasValue ? pl.label + userValue + (gain ? '|' + gain : '') : pl.label)
                          : (hasValue ? userValue + (gain ? '|' + gain : '') : '点击编辑');

                        if (isEditingPrice) {
                          return (
                            <input
                              key={pl.index}
                              autoFocus
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              onBlur={() => savePriceLevel(journal.id, pl.index)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePriceLevel(journal.id, pl.index);
                                if (e.key === 'Escape') cancelEditingPrice();
                              }}
                              className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 outline-none bg-white"
                              style={{ fontSize: `${settings.fontSizes.name || 13}px` }}
                            />
                          );
                        }

                        return (
                          <div
                            key={pl.index}
                            onClick={() => startEditingPrice(journal.id, pl.index, userValue)}
                            className={`text-xs px-1 py-0.5 rounded cursor-pointer ${
                              hasValue
                                ? 'border border-solid border-blue-300 bg-blue-50 text-blue-800'
                                : 'border border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
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
                      <td key={gid} className="px-3 py-1 border border-gray-200 align-top" style={getCellStyle(gid)}>
                        {items.length > 0 ? (
                          <div className="flex flex-col" style={{ gap: `${settings.rowGaps[gid] || 4}px` }}>
                            {items.map(item => renderStrategyCard(item, journal, gid))}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  {settings.showOps && (
                    <td className="px-2 py-1 text-center border border-gray-200" style={getCellStyle('ops')}>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
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

      {/* Popover */}
      {popover && (() => {
        const j = journals.find(j => j.id === popover.journalId);
        if (!j) return null;
        const sid = popover.strategyId;
        return (
          <StrategyPopover
            x={popover.x}
            y={popover.y}
            isBold={j.strategyBold.includes(sid)}
            isRed={j.strategyRed.includes(sid)}
            isYellow={j.strategyYellow.includes(sid)}
            isRedText={j.strategyRedText.includes(sid)}
            onToggle={(field) => handleStrategyToggle(j.id, sid, field)}
            onClose={() => setPopover(null)}
          />
        );
      })()}

      {/* 点击空白处关闭设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)} />
      )}

      {/* PDF 预览弹窗 */}
      {showPdfPreview && (
        <PdfPreviewModal
          rows={exportRows}
          groupIds={groupIds}
          groupNames={groupNames}
          onClose={() => setShowPdfPreview(false)}
        />
      )}
    </div>
  );
};
