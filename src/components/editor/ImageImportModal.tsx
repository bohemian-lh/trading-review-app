import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Loader2, Clipboard, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Input, Select } from '../common';
import type { ParsedTradeData, OcrStrategy, ProfitCalculation } from '@/types';
import { ocrManager } from '@/services/ocr';

interface ImageImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ParsedTradeData) => void;
}

const STRATEGY_OPTIONS = [
  { value: 'cloudflare-ai', label: 'Cloudflare AI（推荐，精度最高）' },
  { value: 'tesseract', label: 'Tesseract.js（本地识别，无需网络）' },
  { value: 'mock', label: '模拟模式（仅测试用）' },
];

export const ImageImportModal: React.FC<ImageImportModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const [step, setStep] = useState<'upload' | 'parsing' | 'preview'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTradeData | null>(null);
  const [calculation, setCalculation] = useState<ProfitCalculation | undefined>(undefined);
  const [showCalculation, setShowCalculation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<OcrStrategy>(ocrManager.getConfig().strategy);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 每次打开模态框时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setStep('upload');
      setImagePreview(null);
      setParsedData(null);
      setCalculation(undefined);
      setShowCalculation(false);
      setError(null);
      setSelectedStrategy(ocrManager.getConfig().strategy);
    }
  }, [isOpen]);
  
  // 监听粘贴事件
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 严格检查：只有在 upload 阶段才允许粘贴
      if (!isOpen || step !== 'upload') {
        return;
      }
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      // 查找图片项
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault(); // 阻止默认粘贴行为
            
            // 显示预览
            const reader = new FileReader();
            reader.onloadend = () => {
              setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            
            // 处理上传
            await handleUpload(file);
            return;
          }
        }
      }
    };
    
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, step]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 只有在 upload 阶段才处理文件选择
    if (step !== 'upload') return;
    
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
      // 更新策略配置
      if (selectedStrategy !== ocrManager.getConfig().strategy) {
        ocrManager.setConfig({ strategy: selectedStrategy });
      }

      // 根据策略选择处理方式
      let result;
      let calculated;
      
      if (selectedStrategy === 'cloudflare-ai') {
        // Cloudflare AI 需要通过后端 API
        const formData = new FormData();
        formData.append('image', file);
        formData.append('strategy', selectedStrategy);

        const response = await fetch('/api/parse-trade-image', {
          method: 'POST',
          body: formData
        });

        result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || '识别失败');
        }
        
        result = result.data;
      } else {
        // Tesseract 或 Mock 在前端处理
        const ocrResult = await ocrManager.parseImage(file);
        
        if (ocrResult.success && ocrResult.data) {
          result = ocrResult.data.structuredData;
          calculated = ocrResult.data.calculation;
        } else {
          throw new Error(ocrResult.error || '识别失败');
        }
      }

      if (result) {
        setParsedData(result);
        setCalculation(calculated);
        setStep('preview');
      } else {
        throw new Error('识别失败');
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
    setCalculation(undefined);
    setShowCalculation(false);
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
          {/* 步骤指示器 */}
          <div className="mb-6">
            <div className="flex items-center justify-center space-x-1 text-xs">
              {[
                { step: 1, label: '选择策略', active: step === 'upload', done: false },
                { step: 2, label: '上传图片', active: step === 'upload', done: false },
                { step: 3, label: '识别图片', active: step === 'parsing', done: step === 'preview' },
                { step: 4, label: '确认数据', active: step === 'preview', done: false },
                { step: 5, label: '完善字段', active: false, done: false },
                { step: 6, label: '添加记录', active: false, done: false },
              ].map((item, index, array) => (
                <React.Fragment key={item.step}>
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mb-1
                      ${item.active ? 'bg-blue-500 text-white' : ''}
                      ${item.done ? 'bg-green-500 text-white' : ''}
                      ${!item.active && !item.done ? 'bg-gray-200 text-gray-400' : ''}
                    `}>
                      {item.done ? '✓' : item.step}
                    </div>
                    <span className={`text-[10px]
                      ${item.active ? 'text-blue-600 font-medium' : ''}
                      ${item.done ? 'text-green-600' : ''}
                      ${!item.active && !item.done ? 'text-gray-400' : ''}
                    `}>
                      {item.label}
                    </span>
                  </div>
                  {index < array.length - 1 && (
                    <div className={`w-6 h-0.5 mt-3
                      ${item.done ? 'bg-green-500' : 'bg-gray-200'}
                    `} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <div className="mt-0.5">①</div>
                <div>
                  <h4 className="font-medium text-blue-800 text-sm">步骤1：选择识别策略</h4>
                  <p className="text-xs text-blue-700 mt-1">选择适合您的OCR识别方式</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  识别策略
                </label>
                <Select
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value as OcrStrategy)}
                  options={STRATEGY_OPTIONS}
                />
                <div className="mt-1">
                  {selectedStrategy === 'mock' && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                      ⚠️ 警告：当前使用的是模拟数据！不会真正识别图片内容。
                    </div>
                  )}
                  {selectedStrategy === 'tesseract' && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                      ✓ 本地 OCR 引擎，免费无需网络。中文识别精度有限，建议截图清晰。
                    </div>
                  )}
                  {selectedStrategy === 'cloudflare-ai' && (
                    <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                      ✓ 使用 AI 视觉模型，识别精度最高。需要网络和 AI 绑定配置。
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <div className="mt-0.5">②</div>
                <div>
                  <h4 className="font-medium text-blue-800 text-sm">步骤2：上传图片文件</h4>
                  <p className="text-xs text-blue-700 mt-1">选择或粘贴您的交易截图</p>
                </div>
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-2 mb-4">
                  <Upload className="h-10 w-10 text-gray-400" />
                  <Clipboard className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-gray-600 mb-2">拖拽图片到此处，点击选择或 <kbd className="px-2 py-1 bg-gray-100 rounded text-sm">Cmd/Ctrl + V</kbd> 粘贴</p>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start justify-center gap-2 mb-4">
                <div className="mt-0.5">③</div>
                <div>
                  <h4 className="font-medium text-blue-800 text-sm">步骤3：根据规则识别图片</h4>
                  <p className="text-xs text-blue-700 mt-1">正在识别表格数据...</p>
                </div>
              </div>
              
              <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
              <p className="text-gray-700">正在识别表格...</p>
              <p className="text-sm text-gray-500 mt-1">请稍候</p>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && parsedData && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                <div className="mt-0.5">④</div>
                <div>
                  <h4 className="font-medium text-green-800 text-sm">步骤4：确认提取的数据</h4>
                  <p className="text-xs text-green-700 mt-1">请确认以下数据，可直接编辑修改</p>
                </div>
              </div>
              
              {/* 原截图显示 */}
              {imagePreview && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">原截图</label>
                  <img src={imagePreview} alt="原交易截图" className="max-w-full h-auto rounded border" />
                </div>
              )}

              {/* 识别的数据编辑 */}
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
              
              {/* 计算过程展示 */}
              {calculation && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowCalculation(!showCalculation)}
                    className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    {showCalculation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    查看计算过程
                  </button>
                  
                  {showCalculation && (
                    <div className="p-3 bg-gray-50 rounded text-sm space-y-2">
                      <div>
                        <span className="font-medium">发生金额列表: </span>
                        <span>{calculation.allAmounts.join(', ')}</span>
                      </div>
                      <div>
                        <span className="font-medium">总金额: </span>
                        <span>{calculation.totalSum.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="font-medium">负数金额列表: </span>
                        <span>{calculation.negativeAmounts.join(', ')}</span>
                      </div>
                      <div>
                        <span className="font-medium">负数绝对值总和: </span>
                        <span>{calculation.negativeAbsSum.toFixed(2)}</span>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="font-medium">盈亏计算: </span>
                        <span>{calculation.totalSum.toFixed(2)} ÷ {calculation.negativeAbsSum.toFixed(2)} = {(calculation.totalSum / calculation.negativeAbsSum).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="font-medium">最终盈亏: </span>
                        <span className={calculation.profitPercent && calculation.profitPercent > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {calculation.profitPercent !== null ? `${(calculation.profitPercent * 100).toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">⑤</div>
                  <div>
                    <h4 className="font-medium text-gray-800 text-sm">步骤5-6：完善字段并添加记录</h4>
                    <p className="text-xs text-gray-600 mt-1">点击"继续"将进入编辑页面，填写其他字段后保存</p>
                  </div>
                </div>
              </div>
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
              继续完善信息 →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
