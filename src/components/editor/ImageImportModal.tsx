import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button, Input } from '../common';
import type { ParsedTradeData } from '@/types';

interface ImageImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ParsedTradeData) => void;
}

export const ImageImportModal: React.FC<ImageImportModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const [step, setStep] = useState<'upload' | 'parsing' | 'preview'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTradeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setStep('parsing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/parse-trade-image', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success && result.data) {
        setParsedData(result.data);
        setStep('preview');
      } else {
        throw new Error(result.error || '识别失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '识别失败，请重试');
      setStep('upload');
    }
  };

  const handleImport = () => {
    if (parsedData) {
      onImport(parsedData);
      handleClose();
    }
  };

  const handleClose = () => {
    onClose();
    setStep('upload');
    setImagePreview(null);
    setParsedData(null);
    setError(null);
  };

  const updateField = (field: keyof ParsedTradeData, value: any) => {
    if (parsedData) {
      setParsedData({ ...parsedData, [field]: value });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            从交易截图导入
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 mb-2">拖拽图片到此处，或点击选择</p>
                <p className="text-sm text-gray-400">支持 JPG、PNG 格式</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {imagePreview && (
                <div className="mt-4">
                  <img src={imagePreview} alt="预览" className="max-w-full h-auto rounded border" />
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Parsing */}
          {step === 'parsing' && (
            <div className="py-8 text-center">
              <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
              <p className="text-gray-700">正在识别表格...</p>
              <p className="text-sm text-gray-500 mt-1">请稍候</p>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && parsedData && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 text-green-800 rounded text-sm flex items-start gap-2">
                <div className="mt-0.5">✓</div>
                <div>
                  识别成功！请确认以下数据是否正确，可直接编辑
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">开单时间</label>
                  <Input
                    value={parsedData.openDate}
                    onChange={(e) => updateField('openDate', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">股票代码</label>
                  <Input
                    value={parsedData.stockCode}
                    onChange={(e) => updateField('stockCode', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">股票名称</label>
                  <Input
                    value={parsedData.stockName}
                    onChange={(e) => updateField('stockName', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">盈亏%</label>
                  <Input
                    type="number"
                    value={parsedData.profitPercent ?? ''}
                    onChange={(e) => updateField('profitPercent', e.target.value ? parseFloat(e.target.value) : null)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">持仓天数</label>
                  <Input
                    type="number"
                    value={parsedData.holdDays ?? ''}
                    onChange={(e) => updateField('holdDays', e.target.value ? parseInt(e.target.value, 10) : null)}
                  />
                </div>
              </div>

              <p className="text-sm text-gray-500">
                其他字段（交易类型、是否系统等）将在下一步填写
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="secondary" onClick={handleClose}>
            取消
          </Button>

          {step === 'preview' && (
            <Button onClick={handleImport}>
              继续导入并编辑
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
