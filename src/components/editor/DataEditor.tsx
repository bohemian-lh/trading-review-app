import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
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
  const { records, addRecord, updateRecord, deleteRecord } = useDataStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TradingRecord | null>(null);
  const [formData, setFormData] = useState<TradingRecordInput>(emptyRecord);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

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

  const getFieldError = (field: string): string | undefined => {
    return validationErrors.find((e) => e.field === field)?.message;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">交易记录</h2>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" />
          添加记录
        </Button>
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
            {records.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  暂无数据，请导入Excel或添加记录
                </td>
              </tr>
            ) : (
              records.map((record) => (
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
        {validationErrors.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <ul className="text-sm text-red-700 space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>• {error.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="开单时间"
            value={formData.openDate}
            onChange={(e) => setFormData({ ...formData, openDate: e.target.value })}
            placeholder="yyyymmdd格式"
            error={getFieldError('openDate')}
          />
          <Input
            label="股票名称"
            value={formData.stockName}
            onChange={(e) => setFormData({ ...formData, stockName: e.target.value })}
            error={getFieldError('stockName')}
          />
          <Input
            label="股票代码"
            value={formData.stockCode}
            onChange={(e) => setFormData({ ...formData, stockCode: e.target.value })}
            error={getFieldError('stockCode')}
          />
          <Select
            label="交易类型"
            options={TRADING_TYPE_OPTIONS}
            value={formData.tradingType}
            onChange={(e) => setFormData({ ...formData, tradingType: e.target.value as TradingType })}
          />
          <Select
            label="是否符合系统"
            options={YES_NO_OPTIONS}
            value={formData.isSystem}
            onChange={(e) => setFormData({ ...formData, isSystem: e.target.value as '是' | '否' })}
          />
          <Select
            label="有无大的失误"
            options={YES_NO_OPTIONS}
            value={formData.hasMistake}
            onChange={(e) => setFormData({ ...formData, hasMistake: e.target.value as '是' | '否' })}
          />
          <Input
            label="盈亏情况 (%)"
            type="number"
            step="0.01"
            value={formData.profitPercent}
            onChange={(e) => setFormData({ ...formData, profitPercent: parseFloat(e.target.value) || 0 })}
          />
          <Input
            label="持仓时间 (天)"
            type="number"
            value={formData.holdDays}
            onChange={(e) => setFormData({ ...formData, holdDays: parseInt(e.target.value) || 0 })}
            error={getFieldError('holdDays')}
          />
          <Select
            label="盘前是否"
            options={YES_NO_OPTIONS}
            value={formData.preMarket}
            onChange={(e) => setFormData({ ...formData, preMarket: e.target.value as '是' | '否' })}
          />
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <Button variant="secondary" onClick={handleCloseModal}>
            <X className="mr-2 h-4 w-4" />
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
