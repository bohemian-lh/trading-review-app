import React, { useMemo, useState } from 'react';
import { Plus, Filter, RefreshCw, CheckCircle, AlertCircle, Image, ChevronUp, ChevronDown, Pencil, Trash2, Eye, FolderOpen, Loader2, FileText } from 'lucide-react';
import { Button, Select, ZoomControls } from '@/components/common';
import { Pagination } from '@/components/common/Pagination';
import { useTableZoom } from '@/hooks/useTableZoom';
import { useRecordsStore } from '@/stores';
import type { TradingRecord } from '@/types';

const YES_NO_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
];

interface Filters {
  month: string;
  tradingType: string;
  entryType: string;
  isSystem: string;
}

interface SortConfig {
  key: 'openDate' | 'stockCode' | null;
  direction: 'asc' | 'desc';
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
  const entryTypeOptions = useMemo(() =>
    fieldConfig.entryTypes.map(t => ({ value: t, label: t })),
    [fieldConfig.entryTypes]
  );

  const allMonthOptions = [{ value: '', label: '全部月份' }, ...monthOptions];
  const allTradingTypeOptions = [{ value: '', label: '全部类型' }, ...tradingTypeOptions];
  const allEntryTypeOptions = [{ value: '', label: '全部' }, ...entryTypeOptions];
  const allYesNoOptions = [{ value: '', label: '全部' }, ...YES_NO_OPTIONS];

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
          {(filters.month || filters.tradingType || filters.entryType || filters.isSystem) && (
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
            <label className="block text-sm font-medium text-gray-700 mb-1">交易切入类型</label>
            <Select
              value={filters.entryType || ''}
              onChange={(e) => onFilterChange({ ...filters, entryType: e.target.value })}
              options={allEntryTypeOptions}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">系统符合</label>
            <Select
              value={filters.isSystem}
              onChange={(e) => onFilterChange({ ...filters, isSystem: e.target.value })}
              options={allYesNoOptions}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票名称</th>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易切入类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">是否符合系统</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">有无大的失误</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏情况</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">持仓时间（天）</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">后续盈亏空间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">理论盈亏率</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">图片</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-gray-500">
                      {records.length === 0 ? '暂无数据，请导入Excel或添加记录' : '无符合筛选条件的记录'}
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((record) => (
                    <React.Fragment key={record.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{record.openDate}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.stockName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.stockCode}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.tradingType}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.entryType.join(', ')}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs rounded ${
                          record.isSystem === '是' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {record.isSystem}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs rounded ${
                          record.hasMistake === '是' ? 'bg-red-100 text-red-800'
                          : record.hasMistake === '其他' ? 'bg-gray-100 text-gray-600'
                          : 'bg-green-100 text-green-800'
                        }`}>
                          {record.hasMistake}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${
                        record.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {record.profitPercent}%
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.holdDays}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {record.subsequentProfitSpace === null ? 'N/A' : `${record.subsequentProfitSpace}%`}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${
                        record.theoreticalProfitPercent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {record.theoreticalProfitPercent}%
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {record.images && record.images.length > 0
                          ? `${record.images.length} 张`
                          : '-'}
                      </td>
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
                        <td colSpan={14} className="px-4 py-3">
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
