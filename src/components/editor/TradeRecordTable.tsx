import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Filter, RefreshCw, CheckCircle, AlertCircle, Image, ChevronUp, ChevronDown, Pencil, Trash2, Eye, FolderOpen, Loader2, FileText, Columns } from 'lucide-react';
import { Button, Select, ZoomControls } from '@/components/common';
import { Pagination } from '@/components/common/Pagination';
import { useTableZoom } from '@/hooks/useTableZoom';
import { useRecordsStore } from '@/stores';
import { getLinkedDimensionParts } from '@/utils/theoreticalRatio';
import type { TradingRecord } from '@/types';

interface Filters {
  month: string;
  tradingType: string;
  trendFeatures: string;
  patternFeatures: string;
}

interface SortConfig {
  key: 'openDate' | 'stockCode' | null;
  direction: 'asc' | 'desc';
}

// ─── 显示列配置 ────────────────────────────────────────────────────
type ColumnKey =
  | 'openDate'
  | 'stockName'
  | 'stockCode'
  | 'tradingType'
  | 'trendFeatures'
  | 'patternFeatures'
  | 'hasMistake'
  | 'profitPercent'
  | 'holdDays'
  | 'positionSize'
  | 'images'
  | `dim:${string}`;

const COLUMN_STORAGE_KEY = 'data_table_hidden_columns';

const BASE_COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'openDate', label: '开单时间' },
  { key: 'stockName', label: '股票名称' },
  { key: 'stockCode', label: '股票代码' },
  { key: 'tradingType', label: '交易类型' },
  { key: 'trendFeatures', label: '趋势特征' },
  { key: 'patternFeatures', label: '模式特征' },
  { key: 'hasMistake', label: '有无大的失误' },
  { key: 'profitPercent', label: '盈亏情况' },
  { key: 'holdDays', label: '持仓时间（天）' },
  { key: 'positionSize', label: '仓位' },
  { key: 'images', label: '图片' },
];

function loadHiddenColumns(): string[] {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function saveHiddenColumns(hidden: string[]) {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(hidden));
  } catch { /* ignore */ }
}

interface TradeRecordTableProps {
  records: TradingRecord[];
  paginatedRecords: TradingRecord[];
  filteredCount: number;
  totalRecords: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortConfig: SortConfig;
  onSort: (key: 'openDate' | 'stockCode') => void;
  filters: Filters;
  monthOptions: Array<{ value: string; label: string }>;
  onFilterChange: (filters: Filters) => void;
  onResetFilters: () => void;
  imgHasHandle: boolean;
  imgPath: string | null;
  onSelectImageDir: () => void;
  statsNeedUpdate: boolean;
  updateStatus: 'idle' | 'loading' | 'success' | 'error';
  updateMessage: string;
  onUpdateStats: () => void;
  isSaving: boolean;
  onAddRecord: () => void;
  onEditRecord: (record: TradingRecord) => void;
  onDeleteRecord: (id: string) => void;
  onImageImport: () => void;
  onPreviewImages: (images: string[]) => void;
}

export const TradeRecordTable: React.FC<TradeRecordTableProps> = ({
  records,
  paginatedRecords,
  filteredCount,
  totalRecords,
  page,
  totalPages,
  onPageChange,
  sortConfig,
  onSort,
  filters,
  monthOptions,
  onFilterChange,
  onResetFilters,
  imgHasHandle,
  imgPath,
  onSelectImageDir,
  statsNeedUpdate,
  updateStatus,
  updateMessage,
  onUpdateStats,
  isSaving,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onImageImport,
  onPreviewImages,
}) => {
  const { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle } = useTableZoom();

  // 从 fieldConfig 动态生成筛选选项
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const tradingTypeOptions = useMemo(() =>
    fieldConfig.tradingTypes.map(t => ({ value: t, label: t })),
    [fieldConfig.tradingTypes]
  );
  const trendFeatureOptions = useMemo(() =>
    fieldConfig.trendFeatures.map(t => ({ value: t, label: t })),
    [fieldConfig.trendFeatures]
  );
  const patternFeatureOptions = useMemo(() =>
    fieldConfig.patternFeatures.map(t => ({ value: t, label: t })),
    [fieldConfig.patternFeatures]
  );

  const theoreticalDimensions = fieldConfig.theoreticalDimensions;

  // ─── 显示列 ──────────────────────────────────────────────────────
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(loadHiddenColumns);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  const configurableColumns = useMemo<Array<{ key: ColumnKey; label: string }>>(
    () => [
      ...BASE_COLUMNS,
      ...theoreticalDimensions.map(d => ({
        key: `dim:${d.id}` as ColumnKey,
        label: d.name || '未命名维度',
      })),
    ],
    [theoreticalDimensions],
  );

  const isVisible = (key: ColumnKey) => !hiddenColumns.includes(key);
  const visibleColumnCount = configurableColumns.filter(c => isVisible(c.key)).length + 1; // + 操作列
  const totalColumns = visibleColumnCount;

  // 点击面板外关闭
  useEffect(() => {
    if (!columnsOpen) return;
    const handler = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setColumnsOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsOpen]);

  const toggleColumn = (key: ColumnKey) => {
    setHiddenColumns(prev => {
      const isHidden = prev.includes(key);
      // 至少保留一列（操作列固定显示，不计入）
      const otherVisible = configurableColumns.filter(c => c.key !== key && !prev.includes(c.key)).length;
      if (!isHidden && otherVisible === 0) return prev;
      const next = isHidden ? prev.filter(k => k !== key) : [...prev, key];
      saveHiddenColumns(next);
      return next;
    });
  };

  const showAllColumns = () => {
    setHiddenColumns([]);
    saveHiddenColumns([]);
  };

  const allMonthOptions = [{ value: '', label: '全部月份' }, ...monthOptions];
  const allTradingTypeOptions = [{ value: '', label: '全部类型' }, ...tradingTypeOptions];
  const allTrendFeatureOptions = [{ value: '', label: '全部' }, ...trendFeatureOptions];
  const allPatternFeatureOptions = [{ value: '', label: '全部' }, ...patternFeatureOptions];

  const updateRecord = useRecordsStore(s => s.updateRecord);
  const [expandedRemarkId, setExpandedRemarkId] = useState<string | null>(null);
  const [remarkEditValues, setRemarkEditValues] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">表1 - 交易记录</h2>
        <div className="flex items-center gap-3">
          <ZoomControls
            zoom={zoom}
            onZoomIn={increaseZoom}
            onZoomOut={decreaseZoom}
            onReset={resetZoom}
            isAtMin={isAtMin}
            isAtMax={isAtMax}
            hint={zoomHint}
            showHint={showZoomHint}
          />
          {/* 列设置 */}
          <div className="relative" ref={columnsRef}>
            <button
              onClick={() => setColumnsOpen(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${
                columnsOpen ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
              }`}
              title="选择要显示的列"
            >
              <Columns className="h-4 w-4" />
              列设置
            </button>
            {columnsOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-30 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between px-1 pb-1.5 border-b border-gray-100 mb-1.5">
                  <span className="text-xs text-gray-500">显示列</span>
                  <button onClick={showAllColumns} className="text-xs text-blue-600 hover:text-blue-800">
                    全部显示
                  </button>
                </div>
                {configurableColumns.map(col => {
                  const checked = isVisible(col.key);
                  const lastVisible = checked && configurableColumns.filter(c => c.key !== col.key && isVisible(c.key)).length === 0;
                  return (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={lastVisible}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded"
                      />
                      <span className={lastVisible ? 'text-gray-400' : ''}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </div>
          )}
          <button
            onClick={onSelectImageDir}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${
              imgHasHandle ? 'border-green-300 text-green-700 bg-green-50' : 'border-orange-300 text-orange-700 bg-orange-50'
            }`}
            title={imgPath ? `图片目录: ${imgPath}` : '选择图片存储目录'}
          >
            <FolderOpen className="h-4 w-4" />
            {imgPath || '选择图片目录'}
          </button>
          <div className="flex items-center gap-2">
            {statsNeedUpdate && (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                有数据需要更新
              </div>
            )}
            <Button
              variant={statsNeedUpdate ? "primary" : "secondary"}
              onClick={onUpdateStats}
              disabled={updateStatus === 'loading' || records.length === 0}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${updateStatus === 'loading' ? 'animate-spin' : ''}`} />
              {statsNeedUpdate ? "更新统计数据" : "手动更新统计数据"}
            </Button>
          </div>
          <Button variant="secondary" onClick={onImageImport}>
            <Image className="mr-2 h-4 w-4" />
            从图片导入
          </Button>
          <Button onClick={onAddRecord}>
            <Plus className="mr-2 h-4 w-4" />
            添加记录
          </Button>
        </div>
      </div>

      {updateStatus !== 'idle' && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          updateStatus === 'success' ? 'bg-green-50 text-green-800' :
          updateStatus === 'error' ? 'bg-red-50 text-red-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          {updateStatus === 'success' && <CheckCircle className="h-5 w-5" />}
          {updateStatus === 'error' && <AlertCircle className="h-5 w-5" />}
          {updateStatus === 'loading' && <RefreshCw className="h-5 w-5 animate-spin" />}
          <span>{updateMessage}</span>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-4 mb-4">
          <Filter className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-800">数据筛选</h3>
          {(filters.month || filters.tradingType || filters.trendFeatures || filters.patternFeatures) && (
            <button onClick={onResetFilters} className="ml-auto text-sm text-gray-600 hover:text-gray-800">
              重置筛选
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">月份筛选</label>
            <Select
              value={filters.month}
              onChange={(e) => onFilterChange({ ...filters, month: e.target.value })}
              options={allMonthOptions}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">交易类型</label>
            <Select
              value={filters.tradingType}
              onChange={(e) => onFilterChange({ ...filters, tradingType: e.target.value })}
              options={allTradingTypeOptions}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">趋势特征</label>
            <Select
              value={filters.trendFeatures || ''}
              onChange={(e) => onFilterChange({ ...filters, trendFeatures: e.target.value })}
              options={allTrendFeatureOptions}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模式特征</label>
            <Select
              value={filters.patternFeatures}
              onChange={(e) => onFilterChange({ ...filters, patternFeatures: e.target.value })}
              options={allPatternFeatureOptions}
            />
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          共 {filteredCount} 条记录 (总计 {totalRecords} 条) · 第 {page}/{totalPages} 页
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div ref={containerRef} className="overflow-auto">
          <div style={zoomStyle}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isVisible('openDate') && (
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => onSort('openDate')}
                    >
                      <div className="flex items-center gap-1">
                        开单时间
                        {sortConfig.key === 'openDate' && (
                          sortConfig.direction === 'asc'
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                  )}
                  {isVisible('stockName') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票名称</th>
                  )}
                  {isVisible('stockCode') && (
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => onSort('stockCode')}
                    >
                      <div className="flex items-center gap-1">
                        股票代码
                        {sortConfig.key === 'stockCode' && (
                          sortConfig.direction === 'asc'
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                  )}
                  {isVisible('tradingType') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易类型</th>
                  )}
                  {isVisible('trendFeatures') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">趋势特征</th>
                  )}
                  {isVisible('patternFeatures') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">模式特征</th>
                  )}
                  {isVisible('hasMistake') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">有无大的失误</th>
                  )}
                  {isVisible('profitPercent') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏情况</th>
                  )}
                  {isVisible('holdDays') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">持仓时间（天）</th>
                  )}
                  {isVisible('positionSize') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">仓位</th>
                  )}
                  {theoreticalDimensions.map(dim => isVisible(`dim:${dim.id}`) && (
                    <th key={dim.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dim.name}</th>
                  ))}
                  {isVisible('images') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">图片</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={totalColumns} className="px-4 py-8 text-center text-gray-500">
                      {records.length === 0 ? '暂无数据，请导入Excel或添加记录' : '无符合筛选条件的记录'}
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((record) => (
                    <React.Fragment key={record.id}>
                    <tr className="hover:bg-gray-50">
                      {isVisible('openDate') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.openDate}</td>
                      )}
                      {isVisible('stockName') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.stockName}</td>
                      )}
                      {isVisible('stockCode') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.stockCode}</td>
                      )}
                      {isVisible('tradingType') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.tradingType}</td>
                      )}
                      {isVisible('trendFeatures') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.trendFeatures.join(', ')}</td>
                      )}
                      {isVisible('patternFeatures') && (
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                            {record.patternFeatures.length > 0 ? record.patternFeatures.join(', ') : '-'}
                          </span>
                        </td>
                      )}
                      {isVisible('hasMistake') && (
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            record.hasMistake === '是' ? 'bg-red-100 text-red-800'
                            : record.hasMistake === '其他' ? 'bg-gray-100 text-gray-600'
                            : 'bg-green-100 text-green-800'
                          }`}>
                            {record.hasMistake}
                          </span>
                        </td>
                      )}
                      {isVisible('profitPercent') && (
                        <td className={`px-4 py-3 text-sm font-medium ${
                          record.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {record.profitPercent}%
                        </td>
                      )}
                      {isVisible('holdDays') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.holdDays}</td>
                      )}
                      {isVisible('positionSize') && (
                        <td className="px-4 py-3 text-sm text-gray-900">{record.positionSize ?? 33}%</td>
                      )}
                      {theoreticalDimensions.map(dim => {
                        if (!isVisible(`dim:${dim.id}`)) return null;
                        const isLinked = !dim.isBase && !!dim.baseDimensionId;
                        if (isLinked) {
                          const { baseValue, delta } = getLinkedDimensionParts(record, dim, theoreticalDimensions);
                          return (
                            <td key={dim.id} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                              {baseValue}% {delta >= 0 ? '+' : '-'} {Math.abs(delta)}%
                            </td>
                          );
                        }
                        const val = record.theoreticalProfitRatios[dim.id];
                        return (
                          <td key={dim.id} className="px-4 py-3 text-sm text-gray-900">
                            {val !== undefined ? `${val}%` : <span className="text-gray-400">默认</span>}
                          </td>
                        );
                      })}
                      {isVisible('images') && (
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {record.images && record.images.length > 0
                            ? `${record.images.length} 张`
                            : '-'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm space-x-2">
                        {record.images && record.images.length > 0 && (
                          <button
                            onClick={() => onPreviewImages(record.images)}
                            className="text-blue-600 hover:text-blue-900"
                            title="查看图片"
                          >
                            <Eye className="h-4 w-4 inline" />
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedRemarkId(expandedRemarkId === record.id ? null : record.id)}
                          className={`${record.remark ? 'text-indigo-600' : 'text-gray-400'} hover:text-indigo-900`}
                          title="备注"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEditRecord(record)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onDeleteRecord(record.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedRemarkId === record.id && (
                      <tr key={`${record.id}-remark`} className="bg-gray-50">
                        <td colSpan={totalColumns} className="px-4 py-3">
                          <div className="text-xs text-gray-500 mb-1">备注</div>
                          <textarea
                            value={remarkEditValues[record.id] ?? record.remark}
                            onChange={(e) => {
                              const val = e.target.value.slice(0, 1000);
                              setRemarkEditValues(prev => ({ ...prev, [record.id]: val }));
                            }}
                            className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-y min-h-[60px] focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            placeholder="暂无备注，输入后自动保存..."
                            rows={2}
                            maxLength={1000}
                          />
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-gray-400">
                              {((remarkEditValues[record.id] ?? record.remark) || '').length}/1000
                            </span>
                            {(remarkEditValues[record.id] !== undefined && remarkEditValues[record.id] !== record.remark) && (
                              <button
                                onClick={() => {
                                  updateRecord(record.id, { ...record, remark: remarkEditValues[record.id] ?? '' });
                                  setExpandedRemarkId(null);
                                  setRemarkEditValues(prev => { const n = { ...prev }; delete n[record.id]; return n; });
                                }}
                                className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                保存备注
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} pageSize={50} total={filteredCount} />
      </div>
    </div>
  );
};
