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
  { value: 'mock', label: 'Mock（测试用）' },
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
  
  // 编辑状态
  const [editOpenDate, setEditOpenDate] = useState<string>('');
  const [editStockCode, setEditStockCode] = useState<string>('');
  const [editStockName, setEditStockName] = useState<string>('');
  const [editAmountsExpression, setEditAmountsExpression] = useState<string>('');
  const [editHoldDays, setEditHoldDays] = useState<number | null>(null);
  const [finalOpenDate, setFinalOpenDate] = useState<string>('');
  const [finalStockCode, setFinalStockCode] = useState<string>('');
  const [finalStockName, setFinalStockName] = useState<string>('');
  const [finalProfit, setFinalProfit] = useState<number | null>(null);
  const [finalHoldDays, setFinalHoldDays] = useState<number | null>(null);
  
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
  
  // 当识别结果返回时，初始化编辑状态
  useEffect(() => {
    if (parsedData && calculation) {
      setEditOpenDate(parsedData.openDate || '');
      setEditStockCode(parsedData.stockCode || '');
      setEditStockName(parsedData.stockName || '');
      setEditHoldDays(parsedData.holdDays ?? null);
      
      // 初始化金额表达式
      const amountStrs = calculation.allAmounts.map(a => 
        a >= 0 ? a.toString() : `(${a.toString()})`
      );
      const expression = amountStrs.join(' + ');
      setEditAmountsExpression(expression);
      
      // 初始化最终数据
      setFinalOpenDate(parsedData.openDate || '');
      setFinalStockCode(parsedData.stockCode || '');
      setFinalStockName(parsedData.stockName || '');
      setFinalHoldDays(parsedData.holdDays ?? null);
      setFinalProfit(parsedData.profitPercent ?? null);
    }
  }, [parsedData, calculation]);
  
  // 监听编辑变化，自动同步到最终数据
  useEffect(() => {
    setFinalOpenDate(editOpenDate);
    setFinalStockCode(editStockCode);
    setFinalStockName(editStockName);
    setFinalHoldDays(editHoldDays);
  }, [editOpenDate, editStockCode, editStockName, editHoldDays]);
  
  // 当表达式变化时重新计算盈亏
  useEffect(() => {
    if (editAmountsExpression) {
      recalculateProfitFromExpression(editAmountsExpression);
    }
  }, [editAmountsExpression]);
  
  // 从表达式重新计算盈亏
  const recalculateProfitFromExpression = (expr: string) => {
    try {
      // 提取表达式中的所有数字
      const numbers: number[] = [];
      // 匹配带括号的负数和正数
      const matches = expr.match(/\(?\-?\d+\.?\d*\)?/g) || [];
      
      for (const match of matches) {
        const cleaned = match.replace(/[()]/g, '');
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
      
      if (numbers.length === 0) {
        setFinalProfit(null);
        return;
      }
      
      const totalSum = numbers.reduce((a, b) => a + b, 0);
      const negativeAmounts = numbers.filter(a => a < 0);
      const negativeAbsSum = Math.abs(negativeAmounts.reduce((a, b) => a + b, 0));
      
      let profit: number | null = null;
      if (negativeAbsSum !== 0) {
        profit = totalSum / negativeAbsSum;
        profit = Math.round(profit * 10000) / 10000;
      }
      
      setFinalProfit(profit);
      
    } catch (e) {
      console.error('表达式计算失败:', e);
    }
  };
  
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
  }, [isOpen, step, selectedStrategy]);

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

        const jsonResult = await response.json();
        
        if (!jsonResult.success) {
          throw new Error(jsonResult.error || '识别失败');
        }
        
        result = jsonResult.data;
        // Cloudflare AI 返回的 structuredData 里可能包含 calculation
        calculated = result?.calculation;
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
    if (finalOpenDate && finalStockCode && finalStockName && finalProfit !== null && finalHoldDays !== null) {
      onImport({
        openDate: finalOpenDate,
        stockCode: finalStockCode,
        stockName: finalStockName,
        profitPercent: finalProfit,
        holdDays: finalHoldDays
      });
      handleClose();
    } else {
      alert('请填写完整的信息');
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[95vh] overflow-hidden flex flex-col">
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
        <div className="p-4 overflow-y-auto flex-1">
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
                      ✓ 本地识别，无需网络。使用坐标定位表格。
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

          {/* Step 3: Preview - 全新的两列布局 */}
          {step === 'preview' && parsedData && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                <div className="mt-0.5">④</div>
                <div>
                  <h4 className="font-medium text-green-800 text-sm">步骤4：确认和编辑识别数据</h4>
                  <p className="text-xs text-green-700 mt-1">编辑左侧的原始数据，结果会同步到右侧</p>
                </div>
              </div>
              
              {/* 原截图预览 */}
              {imagePreview && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">原截图</label>
                  <img src={imagePreview} alt="原交易截图" className="max-w-full h-auto rounded border max-h-60 object-contain" />
                </div>
              )}

              {/* 两列数据编辑表格 */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">字段</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-l">原始识别（可编辑）</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-l">最终数据（自动同步）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {/* 开单时间 */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">开单时间</td>
                      <td className="px-4 py-2 border-l">
                        <Input
                          value={editOpenDate}
                          onChange={(e) => setEditOpenDate(e.target.value)}
                          placeholder="20250101"
                        />
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
                          {finalOpenDate || '-'}
                        </div>
                      </td>
                    </tr>
                    {/* 股票代码 */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">股票代码</td>
                      <td className="px-4 py-2 border-l">
                        <Input
                          value={editStockCode}
                          onChange={(e) => setEditStockCode(e.target.value)}
                          placeholder="600519"
                        />
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
                          {finalStockCode || '-'}
                        </div>
                      </td>
                    </tr>
                    {/* 股票名称 */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">股票名称</td>
                      <td className="px-4 py-2 border-l">
                        <Input
                          value={editStockName}
                          onChange={(e) => setEditStockName(e.target.value)}
                          placeholder="贵州茅台"
                        />
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
                          {finalStockName || '-'}
                        </div>
                      </td>
                    </tr>
                    {/* 盈亏计算（重点） */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">
                        <div className="space-y-1">
                          <div>盈亏计算</div>
                          <button
                            type="button"
                            onClick={() => setShowCalculation(!showCalculation)}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            {showCalculation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {showCalculation ? '收起' : '查看说明'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="space-y-2">
                          <Input
                            value={editAmountsExpression}
                            onChange={(e) => setEditAmountsExpression(e.target.value)}
                            placeholder="9774.28 + (-6460.55) + ..."
                          />
                          {showCalculation && (
                            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                              <p>格式：金额之间用 + 连接，负数用括号包裹</p>
                              <p>示例：9774.28 + (-6460.55) + (-3310.28)</p>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className={`px-3 py-2 border rounded text-sm font-medium
                          ${finalProfit && finalProfit >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}
                        `}>
                          {finalProfit !== null ? `${finalProfit}` : '-'}
                        </div>
                      </td>
                    </tr>
                    {/* 持仓天数 */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">持仓天数</td>
                      <td className="px-4 py-2 border-l">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={editHoldDays !== null ? editHoldDays : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditHoldDays(val ? parseInt(val, 10) : null);
                          }}
                          placeholder="3"
                        />
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
                          {finalHoldDays !== null ? `${finalHoldDays}` : '-'}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 提示信息 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">⑤</div>
                  <div>
                    <h4 className="font-medium text-gray-800 text-sm">步骤5-6：完善字段并添加记录</h4>
                    <p className="text-xs text-gray-600 mt-1">点击"继续完善信息"进入编辑页面，填写其他字段后保存</p>
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