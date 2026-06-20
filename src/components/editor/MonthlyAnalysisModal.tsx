import React from 'react';
import { Save } from 'lucide-react';
import { Button, Input, Modal } from '@/components/common';
import type { MonthlyAnalysis } from '@/types';

const MONTHLY_FIELDS: Array<{ key: keyof Omit<MonthlyAnalysis, 'month'>; label: string }> = [
  { key: 'systemProfitRatio', label: '系统盈亏比' },
  { key: 'systemNoMistakeProfitRatio', label: '系统无失误盈亏比' },
  { key: 'systemWithMistakeProfitRatio', label: '系统有失误盈亏比' },
  { key: 'nonSystemProfitRatio', label: '非系统盈亏比' },
  { key: 'avgProfitRatio', label: '平均盈亏比' },
  { key: 'totalProfit', label: '总盈亏' },
];

interface MonthlyAnalysisModalProps {
  isOpen: boolean;
  editingMonthly: MonthlyAnalysis | null;
  monthlyFormData: Partial<MonthlyAnalysis>;
  onFormChange: (data: Partial<MonthlyAnalysis>) => void;
  onSave: () => void;
  onClose: () => void;
}

export const MonthlyAnalysisModal: React.FC<MonthlyAnalysisModalProps> = ({
  isOpen,
  editingMonthly,
  monthlyFormData,
  onFormChange,
  onSave,
  onClose,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingMonthly ? '编辑月份数据' : '添加月份数据'} size="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-base font-medium text-gray-700 mb-2">
            月份 (yyyymm) <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={monthlyFormData.month || ''}
            onChange={(e) => onFormChange({ ...monthlyFormData, month: e.target.value })}
            placeholder="例如: 202501"
            disabled={!!editingMonthly}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MONTHLY_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-base font-medium text-gray-700 mb-2">{label}</label>
              <Input
                type="text"
                value={(monthlyFormData[key] as string | number) === 'N/A' ? 'N/A' : String(monthlyFormData[key] || '')}
                onChange={(e) => onFormChange({
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
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          保存
        </Button>
      </div>
    </Modal>
  );
};
