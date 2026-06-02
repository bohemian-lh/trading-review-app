import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Save, Filter, RefreshCw, CheckCircle, AlertCircle, Loader2, Table2, BarChart3, Calendar, ChevronUp, ChevronDown, Image, TrendingUp } from 'lucide-react';
import { Button, Input, Select, Modal, Toggle } from '@/components/common';
import { useDataStore, useAnalysisResult, useMonthlyAnalysis } from '@/stores';
import type { TradingRecord, TradingRecordInput, TradingType, MonthlyAnalysis, AnalysisResult, ParsedTradeData } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';
import { validateTradingRecord } from '@/utils/validationUtils';
import { ImportModal } from './ImportModal';

type ValidationError = { field: string; message: string };

const TRADING_TYPE_OPTIONS = [
  { value: '齐飞水底', label: '齐飞水底' },
  { value: '齐飞前多踩MA', label: '齐飞前多踩MA' },
  { value: '风险释放平台转一致', label: '风险释放平台转一致' },
  { value: '双阳平台转一致', label: '双阳平台转一致' },
  { value: '非系统', label: '非系统' },
];

const YES_NO_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
];

const emptyRecord: TradingRecordInput = {
  openDate: getDefaultOpenDate(),
  stockName: '',
  stockCode: '',
  tradingType: '齐飞水底',
  isSystem: '是',
  hasMistake: '否',
  profitPercent: null,
  holdDays: null,
  preMarket: '否',
};

interface Filters {
  month: string;
  tradingType: string;
  isSystem: string;
}

interface SortConfig {
  key: 'openDate' | 'stockCode' | null;
  direction: 'asc' | 'desc';
}

function validateForm(data: TradingRecordInput): { field: string; message: string }[] {
  const result = validateTradingRecord(data as Partial<TradingRecord>);
  return result.errors.map(err => ({ field: err.field, message: err.message }));
}

const ANALYSIS_FIELDS: Array<{ key: keyof AnalysisResult; label: string }> = [
  { key: 'systemProfitRatio', label: '符合系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '符合系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '符合系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '不符合系统盈亏比' },
  { key: 'systemProfitAvgHoldDays', label: '符合系统盈利平均持仓' },
  { key: 'systemLossAvgHoldDays', label: '符合系统亏损平均持仓' },
  { key: 'nonSystemProfitAvgHoldDays', label: '不符合系统盈利平均持仓' },
  { key: 'nonSystemLossAvgHoldDays', label: '不符合系统亏损平均持仓' },
];

const MONTHLY_FIELDS: Array<{ key: keyof Omit<MonthlyAnalysis, 'month'>; label: string }> = [
  { key: 'systemProfitRatio', label: '系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '系统无失误' },
  { key: 'systemWithMistakeProfitRatio', label: '系统有失误' },
  { key: 'nonSystemProfitRatio', label: '非系统' },
  { key: 'avgProfitRatio', label: '平均盈亏比' },
  { key: 'totalProfit', label: '总盈亏' },
];

export const DataEditor: React.FC = () => {
  const { 
    records, addRecord, updateRecord, deleteRecord, isSaving, saveToR2,
    customAnalysis, updateCustomAnalysisField, toggleUseCustomAnalysis,
    customMonthly, addCustomMonthly, updateCustomMonthly, deleteCustomMonthly, toggleUseCustomMonthly,
    setCustomAnalysis, setCustomMonthly,
    cycleStats, updateCycleStats
  } = useDataStore();
  
  const computedAnalysis = useAnalysisResult();
  const computedMonthly = useMonthlyAnalysis();
  
  const [activeTab, setActiveTab] = useState<'table1' | 'table2' | 'table3' | 'table4'>('table1');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [filters, setFilters] = useState<Filters>({
    month: '',
    tradingType: '',
    isSystem: '',
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'openDate',
    direction: 'desc',
  });
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [editingMonthly, setEditingMonthly] = useState<MonthlyAnalysis | null>(null);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [monthlyFormData, setMonthlyFormData] = useState<Partial<MonthlyAnalysis>>({});
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);

  // 处理排序点击
  const handleSort = (key: 'openDate' | 'stockCode') => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: key === 'openDate' ? 'desc' : 'asc',
      };
    });
  };

  // 计算筛选和排序后的数据
  const filteredRecords = useMemo(() => {
    // 先筛选
    let result = records.filter((record) => {
      if (filters.month && !record.openDate.startsWith(filters.month)) {
        return false;
      }
      if (filters.tradingType && record.tradingType !== filters.tradingType) {
        return false;
      }
      if (filters.isSystem && record.isSystem !== filters.isSystem) {
        return false;
      }
      return true;
    });

    // 再排序
    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [records, filters, sortConfig]);

  // 获取所有可用的月份选项
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    records.forEach((record) => {
      if (record.openDate && record.openDate.length >= 6) {
        months.add(record.openDate.slice(0, 6));
      }
    });
    return Array.from(months).sort().map((month) => ({
      value: month,
      label: `${month.slice(0, 4)}-${month.slice(4, 6)}`,
    }));
  }, [records]);

  const handleOpenModal = (record?: TradingRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        openDate: record.openDate,
        stockName: record.stockName,
        stockCode: record.stockCode,
        tradingType: record.tradingType,
        isSystem: record.isSystem,
        hasMistake: record.hasMistake,
        profitPercent: record.profitPercent,
        holdDays: record.holdDays,
        preMarket: record.preMarket,
      });
    } else {
      setEditingRecord(null);
      setFormData({ ...emptyRecord, openDate: getDefaultOpenDate() });
    }
    setValidationErrors([]);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData(emptyRecord);
    setValidationErrors([]);
  };

  const handleSave = () => {
    const errors = validateForm(formData);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // 验证通过后，确保这些字段是有效的数字（不可能为 null）
    const saveData = {
      ...formData,
      profitPercent: formData.profitPercent as number,
      holdDays: formData.holdDays as number,
    };

    if (editingRecord) {
      updateRecord(editingRecord.id, saveData);
    } else {
      addRecord(saveData);
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(id);
    }
  };

  const resetFilters = () => {
    setFilters({
      month: '',
      tradingType: '',
      isSystem: '',
    });
  };

  const getFieldError = (field: string): string | undefined => {
    return validationErrors.find((e) => e.field === field)?.message;
  };

  const handleUpdateStats = async () => {
    if (records.length === 0) {
      setUpdateStatus('error');
      setUpdateMessage('没有数据需要处理');
      return;
    }

    setUpdateStatus('loading');
    setUpdateMessage('正在更新统计数据...');

    try {
      // 更新周期统计
      updateCycleStats();
      // 保存到 R2
      await saveToR2();
      setUpdateStatus('success');
      setUpdateMessage('统计数据已更新');
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : '更新失败');
    }

    setTimeout(() => {
      setUpdateStatus('idle');
      setUpdateMessage('');
    }, 5000);
  };

  const handleAnalysisFieldChange = (field: keyof AnalysisResult, value: string) => {
    const parsedValue = value === 'N/A' ? 'N/A' : Number(value);
    updateCustomAnalysisField(field, parsedValue);
  };

  const handleOpenMonthlyModal = (item?: MonthlyAnalysis) => {
    if (item) {
      setEditingMonthly(item);
      setMonthlyFormData({ ...item });
    } else {
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '',
        systemProfitRatio: 'N/A',
        systemNoMistakeProfitRatio: 'N/A',
        systemWithMistakeProfitRatio: 'N/A',
        nonSystemProfitRatio: 'N/A',
        avgProfitRatio: 'N/A',
        totalProfit: 'N/A',
      });
    }
    setIsMonthlyModalOpen(true);
  };

  const handleCloseMonthlyModal = () => {
    setIsMonthlyModalOpen(false);
    setEditingMonthly(null);
    setMonthlyFormData({});
  };

  const handleSaveMonthly = () => {
    if (!monthlyFormData.month) {
      alert('请输入月份');
      return;
    }
    
    if (editingMonthly) {
      updateCustomMonthly(editingMonthly.month, monthlyFormData as MonthlyAnalysis);
    } else {
      addCustomMonthly(monthlyFormData as MonthlyAnalysis);
    }
    handleCloseMonthlyModal();
  };

  // 图片导入处理
  const handleImageImport = (data: ParsedTradeData) => {
    // 填充表单数据
    setFormData({
      ...emptyRecord,
      openDate: data.openDate,
      stockName: data.stockName,
      stockCode: data.stockCode,
      profitPercent: data.profitPercent,
      holdDays: data.holdDays,
    });
    setIsModalOpen(true); // 打开编辑表单
  };

  const handleDeleteMonthly = (month: string) => {
    if (confirm('确定要删除这个月份的数据吗？')) {
      deleteCustomMonthly(month);
    }
  };

  const syncFromComputed = () => {
    if (confirm('确定要把当前计算的数据同步到自定义数据吗？')) {
      setCustomAnalysis({ useCustom: true, data: computedAnalysis });
      setCustomMonthly({ useCustom: true, data: computedMonthly });
    }
  };

  const allMonthOptions = [
    { value: '', label: '全部月份' },
    ...monthOptions,
  ];

  const allTradingTypeOptions = [
    { value: '', label: '全部类型' },
    ...TRADING_TYPE_OPTIONS,
  ];

  const allYesNoOptions = [
    { value: '', label: '全部' },
    ...YES_NO_OPTIONS,
  ];

  const renderTable1 = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">表1 - 交易记录</h2>
        <div className="flex items-center gap-3">
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </div>
          )}
          <Button 
            variant="secondary" 
            onClick={handleUpdateStats}
            disabled={updateStatus === 'loading' || records.length === 0}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${updateStatus === 'loading' ? 'animate-spin' : ''}`} />
            手动更新统计数据
          </Button>
          <Button variant="secondary" onClick={() => setIsImageImportModalOpen(true)}>
            <Image className="mr-2 h-4 w-4" />
            从图片导入
          </Button>
          <Button onClick={() => handleOpenModal()}>
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
          {(filters.month || filters.tradingType || filters.isSystem) && (
            <button
              onClick={resetFilters}
              className="ml-auto text-sm text-gray-600 hover:text-gray-800"
            >
              重置筛选
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              月份筛选
            </label>
            <Select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              options={allMonthOptions}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              交易类型
            </label>
            <Select
              value={filters.tradingType}
              onChange={(e) => setFilters({ ...filters, tradingType: e.target.value })}
              options={allTradingTypeOptions}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              系统符合
            </label>
            <Select
              value={filters.isSystem}
              onChange={(e) => setFilters({ ...filters, isSystem: e.target.value })}
              options={allYesNoOptions}
            />
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          共 {filteredRecords.length} 条记录 (总计 {records.length} 条)
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('openDate')}
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
                onClick={() => handleSort('stockCode')}
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">系统</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">失误</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏%</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">持仓天</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  {records.length === 0 ? '暂无数据，请导入Excel或添加记录' : '无符合筛选条件的记录'}
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{record.openDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{record.stockName}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{record.stockCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{record.tradingType}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs rounded ${
                      record.isSystem === '是' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {record.isSystem}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs rounded ${
                      record.hasMistake === '是' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
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
                  <td className="px-4 py-3 text-sm space-x-2">
                    <button
                      onClick={() => handleOpenModal(record)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTable2 = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">表2 - 动态统计数据</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">使用自定义数据</span>
            <Toggle
              checked={customAnalysis.useCustom}
              onChange={toggleUseCustomAnalysis}
            />
          </div>
          <Button variant="secondary" onClick={syncFromComputed}>
            从计算同步
          </Button>
        </div>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {customAnalysis.useCustom ? '当前使用自定义数据' : '当前使用自动计算数据'}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {customAnalysis.useCustom 
                ? '你可以在下方编辑自定义数据，这些数据会被保存和导出' 
                : '数据会根据表1自动计算，切换到自定义模式后可以编辑'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
          {ANALYSIS_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{label}</label>
              {customAnalysis.useCustom ? (
                <Input
                  type="text"
                  value={customAnalysis.data[key] === 'N/A' ? 'N/A' : String(customAnalysis.data[key])}
                  onChange={(e) => handleAnalysisFieldChange(key, e.target.value)}
                  placeholder="输入数值或 N/A"
                />
              ) : (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                  {computedAnalysis[key] === 'N/A' ? 'N/A' : String(computedAnalysis[key])}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTable3 = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">表3 - 月度统计数据</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">使用自定义数据</span>
            <Toggle
              checked={customMonthly.useCustom}
              onChange={toggleUseCustomMonthly}
            />
          </div>
          <Button variant="secondary" onClick={syncFromComputed}>
            从计算同步
          </Button>
          {customMonthly.useCustom && (
            <Button onClick={() => handleOpenMonthlyModal()}>
              <Plus className="mr-2 h-4 w-4" />
              添加月份
            </Button>
          )}
        </div>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {customMonthly.useCustom ? '当前使用自定义数据' : '当前使用自动计算数据'}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {customMonthly.useCustom 
                ? '你可以在下方添加、编辑月份数据，这些数据会被保存和导出' 
                : '数据会根据表1自动计算，切换到自定义模式后可以编辑'}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">月份</th>
              {MONTHLY_FIELDS.map(({ label }) => (
                <th key={label} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {label}
                </th>
              ))}
              {customMonthly.useCustom && (
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(customMonthly.useCustom ? customMonthly.data : computedMonthly).length === 0 ? (
              <tr>
                <td colSpan={MONTHLY_FIELDS.length + 2} className="px-4 py-8 text-center text-gray-500">
                  暂无月度数据
                </td>
              </tr>
            ) : (
              (customMonthly.useCustom ? customMonthly.data : computedMonthly).map((item) => (
                <tr key={item.month} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.month}</td>
                  {MONTHLY_FIELDS.map(({ key }) => (
                    <td key={key} className="px-3 py-3 text-sm text-gray-700">
                      {item[key] === 'N/A' ? 'N/A' : String(item[key])}
                    </td>
                  ))}
                  {customMonthly.useCustom && (
                    <td className="px-3 py-3 text-sm space-x-2">
                      <button
                        onClick={() => handleOpenMonthlyModal(item)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMonthly(item.month)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('table1')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table1'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Table2 className="h-4 w-4" />
            表1 - 交易记录
          </button>
          <button
            onClick={() => setActiveTab('table2')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table2'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            表2 - 动态统计
          </button>
          <button
            onClick={() => setActiveTab('table3')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table3'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar className="h-4 w-4" />
            表3 - 月度统计
          </button>
          <button
            onClick={() => setActiveTab('table4')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'table4'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            表4 - 周期统计
          </button>
        </nav>
      </div>

      {activeTab === 'table1' && renderTable1()}
      {activeTab === 'table2' && renderTable2()}
      {activeTab === 'table3' && renderTable3()}
      {activeTab === 'table4' && (() => {
        // 将所有统计类型的周期数据展平
        const allStats: any[] = [];
        for (const [statType, cycles] of Object.entries(cycleStats)) {
          for (const cycle of cycles || []) {
            allStats.push({ ...cycle, statType });
          }
        }

        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">表4-周期统计</h2>
              <div className="text-sm text-gray-600">
                共 {allStats.length} 个周期
              </div>
            </div>

            {allStats.length === 0 ? (
              <div className="bg-gray-50 p-8 text-center rounded-lg border border-gray-200">
                <p className="text-gray-500">暂无周期统计数据</p>
                <p className="text-sm text-gray-400 mt-2">点击「手动更新统计数据」按钮生成周期统计</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">统计类型</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">开始日期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">结束日期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">记录数</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">完整周期</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈利总和</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">亏损绝对值总和</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">盈亏比</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allStats.map((stat, index) => (
                      <tr key={`${stat.statType}-${index}`} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-medium text-gray-900">{stat.statType}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.startDate}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.endDate}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.recordCount}</td>
                        <td className="px-3 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            stat.isComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {stat.isComplete ? '是' : '否'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.profitSum}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{stat.lossSum}</td>
                        <td className={`px-3 py-3 text-sm font-medium ${
                          (stat.profitRatio ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stat.profitRatio ?? 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingRecord ? '编辑记录' : '添加记录'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                开单时间 (yyyymmdd) <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.openDate}
                onChange={(e) => setFormData({ ...formData, openDate: e.target.value })}
                placeholder="例如: 20250101"
                error={getFieldError('openDate')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                股票名称 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockName}
                onChange={(e) => setFormData({ ...formData, stockName: e.target.value })}
                placeholder="例如: 贵州茅台"
                error={getFieldError('stockName')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                股票代码 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockCode}
                onChange={(e) => setFormData({ ...formData, stockCode: e.target.value })}
                placeholder="例如: 600519"
                error={getFieldError('stockCode')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                交易类型
              </label>
              <Select
                value={formData.tradingType}
                onChange={(e) => setFormData({ ...formData, tradingType: e.target.value as TradingType })}
                options={TRADING_TYPE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                符合系统
              </label>
              <Select
                value={formData.isSystem}
                onChange={(e) => setFormData({ ...formData, isSystem: e.target.value as '是' | '否' })}
                options={YES_NO_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                有失误
              </label>
              <Select
                value={formData.hasMistake}
                onChange={(e) => setFormData({ ...formData, hasMistake: e.target.value as '是' | '否' })}
                options={YES_NO_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                盈亏% <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.1"
                value={formData.profitPercent !== null ? formData.profitPercent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    profitPercent: val === '' ? null : parseFloat(val)
                  });
                }}
                placeholder="例如: 16.1 或 -15.3"
                error={getFieldError('profitPercent')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                持仓天数 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={formData.holdDays !== null ? formData.holdDays : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    holdDays: val === '' ? null : parseInt(val, 10)
                  });
                }}
                placeholder="例如: 3"
                error={getFieldError('holdDays')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                盘前是否
              </label>
              <Select
                value={formData.preMarket}
                onChange={(e) => setFormData({ ...formData, preMarket: e.target.value as '是' | '否' })}
                options={YES_NO_OPTIONS}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="secondary" onClick={handleCloseModal}>
            取消
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isMonthlyModalOpen} onClose={handleCloseMonthlyModal} title={editingMonthly ? '编辑月份数据' : '添加月份数据'} size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              月份 (yyyymm) <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={monthlyFormData.month || ''}
              onChange={(e) => setMonthlyFormData({ ...monthlyFormData, month: e.target.value })}
              placeholder="例如: 202501"
              disabled={!!editingMonthly}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MONTHLY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <Input
                  type="text"
                  value={(monthlyFormData[key] as string | number) === 'N/A' ? 'N/A' : String(monthlyFormData[key] || '')}
                  onChange={(e) => setMonthlyFormData({ 
                    ...monthlyFormData, 
                    [key]: e.target.value === 'N/A' ? 'N/A' : Number(e.target.value) 
                  })}
                  placeholder="输入数值或 N/A"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="secondary" onClick={handleCloseMonthlyModal}>
            取消
          </Button>
          <Button onClick={handleSaveMonthly}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </Modal>

      {/* 导入模态框 */}
      <ImportModal
        isOpen={isImageImportModalOpen}
        onClose={() => setIsImageImportModalOpen(false)}
        onImport={handleImageImport}
      />
    </div>
  );
};
