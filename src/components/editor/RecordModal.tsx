import React, { useState, useMemo, useEffect } from 'react';
import { Save, Clipboard, AlertCircle, Loader2, X } from 'lucide-react';
import { Button, Input, Select, Modal } from '@/components/common';
import { ImagePreviewModal } from '@/components/editor/ImagePreviewModal';
import { useRecordsStore } from '@/stores';
import type { TradingRecord, TradingRecordInput, TradingType, MistakeStatus, EntryType } from '@/types';

const YES_NO_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
];

const HAS_MISTAKE_OPTIONS = [
  { value: '是', label: '是' },
  { value: '否', label: '否' },
  { value: '其他', label: '其他' },
];

type ValidationError = { field: string; message: string };

interface RecordModalProps {
  isOpen: boolean;
  editingRecord: TradingRecord | null;
  formData: TradingRecordInput;
  validationErrors: ValidationError[];
  saveError: string | null;
  isSaving: boolean;
  imgHasHandle: boolean;
  onFormChange: (data: TradingRecordInput) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
  onClipboardPaste: () => Promise<void>;
  onClearImages: () => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  editingRecord,
  formData,
  validationErrors,
  saveError,
  isSaving,
  imgHasHandle,
  onFormChange,
  onSave,
  onClose,
  onClipboardPaste,
  onClearImages,
}) => {
  const [imagePreviewImages, setImagePreviewImages] = useState<string[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [subsequentNumberMode, setSubsequentNumberMode] = useState(true);
  const [theoryManual, setTheoryManual] = useState(false);

  // 新记录时，自动计算理论盈亏比，除非用户已手动修改
  useEffect(() => {
    if (!editingRecord && !theoryManual && formData.profitPercent !== null) {
      const subsequent = subsequentNumberMode ? (formData.subsequentProfitSpace ?? 0) : 0;
      const computed = parseFloat((formData.profitPercent + subsequent).toFixed(2));
      if (computed !== formData.theoreticalProfitPercent) {
        onFormChange({ ...formData, theoreticalProfitPercent: computed });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.profitPercent, subsequentNumberMode, formData.subsequentProfitSpace]);

  // 从 fieldConfig 动态生成选项
  const fieldConfig = useRecordsStore(s => s.fieldConfig);
  const tradingTypeOptions = useMemo(() =>
    fieldConfig.tradingTypes.map(t => ({ value: t, label: t })),
    [fieldConfig.tradingTypes]
  );
  const entryTypeOptions = useMemo(() =>
    fieldConfig.entryTypes.map(t => ({ value: t, label: t })),
    [fieldConfig.entryTypes]
  );

  const getFieldError = (field: string): string | undefined => {
    return validationErrors.find((e) => e.field === field)?.message;
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={editingRecord ? '编辑记录' : '添加记录'} size="2xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {/* 开单时间 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                开单时间 (yyyymmdd) <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.openDate}
                onChange={(e) => onFormChange({ ...formData, openDate: e.target.value })}
                placeholder="例如: 20250101"
                error={getFieldError('openDate')}
              />
            </div>
            {/* 股票代码 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                股票代码 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockCode}
                onChange={(e) => onFormChange({ ...formData, stockCode: e.target.value })}
                placeholder="例如: 600519"
                error={getFieldError('stockCode')}
              />
            </div>
            {/* 盘前是否 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                盘前是否
              </label>
              <Select
                value={formData.preMarket}
                onChange={(e) => onFormChange({ ...formData, preMarket: e.target.value as '是' | '否' })}
                options={YES_NO_OPTIONS}
              />
            </div>
            {/* 股票名称 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                股票名称 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.stockName}
                onChange={(e) => onFormChange({ ...formData, stockName: e.target.value })}
                placeholder="例如: 贵州茅台"
                error={getFieldError('stockName')}
              />
            </div>
            {/* 符合系统 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                符合系统
              </label>
              <Select
                value={formData.isSystem}
                onChange={(e) => {
                  const newIsSystem = e.target.value as '是' | '否';
                  onFormChange({
                    ...formData,
                    isSystem: newIsSystem,
                    tradingType: newIsSystem === '否' ? '非系统' : formData.tradingType,
                    hasMistake: newIsSystem === '否' ? '其他' : formData.hasMistake,
                  });
                }}
                options={YES_NO_OPTIONS}
              />
            </div>
            {/* 盈亏% */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                盈亏% <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.1"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={formData.profitPercent !== null ? formData.profitPercent : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') {
                    onFormChange({ ...formData, profitPercent: null });
                    return;
                  }
                  const num = parseFloat(raw);
                  if (isNaN(num)) return;
                  onFormChange({ ...formData, profitPercent: num });
                }}
                placeholder="例如: 16.1 或 -15.3"
                error={getFieldError('profitPercent')}
              />
            </div>
            {/* 交易类型 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                交易类型
              </label>
              <Select
                value={formData.tradingType}
                onChange={(e) => onFormChange({ ...formData, tradingType: e.target.value as TradingType })}
                options={tradingTypeOptions}
              />
            </div>
            {/* 持仓天数 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                持仓天数 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={formData.holdDays !== null ? formData.holdDays : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') {
                    onFormChange({ ...formData, holdDays: null });
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (isNaN(num)) return;
                  onFormChange({ ...formData, holdDays: num });
                }}
                placeholder="例如: 3"
                error={getFieldError('holdDays')}
              />
            </div>
            {/* 交易切入类型 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                交易切入类型
              </label>
              <Select
                value={formData.entryType}
                onChange={(e) => onFormChange({ ...formData, entryType: e.target.value as EntryType })}
                options={entryTypeOptions}
              />
            </div>
            {/* 存在重大失误 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                存在重大失误
              </label>
              <Select
                value={formData.hasMistake}
                onChange={(e) => onFormChange({ ...formData, hasMistake: e.target.value as MistakeStatus })}
                options={HAS_MISTAKE_OPTIONS}
              />
            </div>
            {/* 理论盈亏比 */}
            <div>
              <label className="block text-base font-medium text-gray-700 mb-2">
                理论盈亏比%
              </label>
              <Input
                type="number"
                step="0.1"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={formData.theoreticalProfitPercent !== undefined ? formData.theoreticalProfitPercent : ''}
                onChange={(e) => {
                  if (!theoryManual) setTheoryManual(true);
                  const raw = e.target.value;
                  if (raw === '' || raw === '-') {
                    onFormChange({ ...formData, theoreticalProfitPercent: 0 });
                    return;
                  }
                  const num = parseFloat(raw);
                  if (isNaN(num)) return;
                  onFormChange({ ...formData, theoreticalProfitPercent: parseFloat(num.toFixed(2)) });
                }}
                placeholder="默认 = 盈亏% + 后续盈亏空间%"
              />
            </div>
            {/* 后续盈亏空间% */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                后续盈亏空间%
              </label>
              <div className="flex gap-2">
                <select
                  value={subsequentNumberMode ? 'number' : 'N/A'}
                  onChange={(e) => {
                    const isNum = e.target.value === 'number';
                    setSubsequentNumberMode(isNum);
                  }}
                  className="w-24 rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm"
                >
                  <option value="N/A">N/A</option>
                  <option value="number">数值</option>
                </select>
                {subsequentNumberMode && (
                  <Input
                    type="number"
                    step="0.1"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={formData.subsequentProfitSpace !== null ? formData.subsequentProfitSpace : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        onFormChange({ ...formData, subsequentProfitSpace: null });
                        return;
                      }
                      const num = parseFloat(raw);
                      if (isNaN(num)) return;
                      onFormChange({ ...formData, subsequentProfitSpace: parseFloat(num.toFixed(2)) });
                    }}
                    placeholder="例如: 5.2"
                    error={getFieldError('subsequentProfitSpace')}
                  />
                )}
              </div>
            </div>

            {/* 备注 */}
            <div className="md:col-span-2">
              <label className="block text-base font-medium text-gray-700 mb-2">
                备注 <span className="text-xs text-gray-400">(选填, 最多1000字)</span>
              </label>
              <textarea
                value={formData.remark ?? ''}
                onChange={(e) => onFormChange({ ...formData, remark: e.target.value })}
                className="w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm resize-y min-h-[80px]"
                placeholder="可填写任意备注信息..."
                maxLength={1000}
                rows={3}
              />
            </div>
          </div>

          {/* 图片粘贴区域 */}
          <div className="border-t pt-4">
            <label className="block text-base font-medium text-gray-700 mb-2">
              交易截图 <span className="text-xs text-gray-400">(从剪切板粘贴)</span>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClipboardPaste} disabled={!imgHasHandle}>
                <Clipboard className="mr-1.5 h-4 w-4" />
                从剪切板粘贴
              </Button>
              {formData.images && formData.images.length > 0 && (
                <>
                  <span className="text-sm text-gray-500">
                    已粘贴 {formData.images.length} 张
                    {formData.imagePrefix && <> · 前缀: {formData.imagePrefix}</>}
                  </span>
                  <button onClick={onClearImages} className="text-xs text-red-500 hover:text-red-700">
                    全部清除
                  </button>
                </>
              )}
              {formData.images && formData.images.length > 0 && (
                <button
                  onClick={() => { setImagePreviewImages(formData.images!); setIsImagePreviewOpen(true); }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  预览
                </button>
              )}
            </div>
            {formData.images && formData.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {formData.images.map((img, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                    {img}
                    <button
                      onClick={() => {
                        const newImages = formData.images!.filter((_, i) => i !== idx);
                        onFormChange({
                          ...formData,
                          images: newImages,
                          imagePrefix: newImages.length === 0 ? '' : formData.imagePrefix,
                        });
                      }}
                      className="text-gray-400 hover:text-red-500"
                      title="移除这张图片"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {!imgHasHandle && (
              <p className="text-xs text-orange-600 mt-1">请先在页面顶部选择图片存储目录</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-5 border-t">
          {saveError && (
            <div className="flex-1 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{saveError}</span>
            </div>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSaving} size="lg">
            取消
          </Button>
          <Button onClick={onSave} disabled={isSaving} size="lg">
            {isSaving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </Modal>

      <ImagePreviewModal
        images={imagePreviewImages}
        isOpen={isImagePreviewOpen}
        onClose={() => { setIsImagePreviewOpen(false); setImagePreviewImages([]); }}
      />
    </>
  );
};
