import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Save, Filter, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button, Input, Select, Modal } from '@/components/common';
import { useDataStore } from '@/stores';
import type { TradingRecord, TradingRecordInput, TradingType } from '@/types';
import { getDefaultOpenDate } from '@/utils/dateUtils';

const TRADING_TYPE_OPTIONS = [
  { value: '齐飞水底', label: '齐飞水底' },
  { value: '齐飞前多踩MA', label: '齐飞前多踩MA' },
  { value: '风险释放平台转一致', label: '风险释放平台转一致' },
  { value: '双阳平台转一致', label: '双阳平台转一致' },
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
  profitPercent: 0,
  holdDays: 0,
  preMarket: '否',
};

interface ValidationError {
  field: string;
  message: string;
}

interface Filters {
  month: string;
  tradingType: string;
  isSystem: string;
}

function validateForm(data: TradingRecordInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.openDate || !/^\d{8}$/.test(data.openDate)) {
    errors.push({ field: 'openDate', message: '开单时间必须为8位数字，格式：yyyymmdd' });
  }

  if (!data.stockName || !data.stockName.trim()) {
    errors.push({ field: 'stockName', message: '股票名称不能为空' });
  }

  if (!data.stockCode || !data.stockCode.trim()) {
    errors.push({ field: 'stockCode', message: '股票代码不能为空' });
  }

  if (data.holdDays < 0) {
    errors.push({ field: 'holdDays', message: '持仓时间不能为负数' });
  }

  return errors;
}

export const DataEditor: React.FC = () => {
  const { records, addRecord, updateRecord, deleteRecord, isSaving, saveToR2 } = useDataStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [filters, setFilters] = useState<Filters>({
    month: '',
    tradingType: '',
    isSystem: '',
  });
  
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');

  // 计算筛选后的数据
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // 按月份筛选 (前6位 yyyymm)
      if (filters.month && !record.openDate.startsWith(filters.month)) {
        return false;
      }

      // 按交易类型筛选
      if (filters.tradingType && record.tradingType !== filters.tradingType) {
        return false;
      }

      // 按系统是否筛选
      if (filters.isSystem && record.isSystem !== filters.isSystem) {
        return false;
      }

      return true;
    });
  }, [records, filters]);

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

    if (editingRecord) {
      updateRecord(editingRecord.id, formData);
    } else {
      addRecord(formData);
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

  // 构造筛选的选项
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">交易记录</h2>
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
          <Button onClick={() => handleOpenModal()}>
            <Plus className="mr-2 h-4 w-4" />
            添加记录
          </Button>
        </div>
      </div>

      {/* 更新状态提示 */}
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

      {/* 筛选区域 */}
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">开单时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票代码</th>
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
                      className="text-primary-600 hover:text-primary-900"
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
                盈亏%
              </label>
              <Input
                type="number"
                value={formData.profitPercent}
                onChange={(e) => setFormData({ ...formData, profitPercent: Number(e.target.value) })}
                placeholder="例如: 5.2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                持仓天数 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                value={formData.holdDays}
                onChange={(e) => setFormData({ ...formData, holdDays: Number(e.target.value) })}
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
    </div>
  );
};
