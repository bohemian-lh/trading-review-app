import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Loader2, Clipboard, FileText, Settings } from 'lucide-react';
import { Button, Input, Select, Modal } from '../common';
import type { ParsedTradeData } from '@/types';
import { ocrManager } from '@/services/ocr';
import { parseTradeText, DEFAULT_HEADER_KEYWORDS } from '@/services/text-parser';
import { useHeaderKeywordsStore } from '@/stores/headerKeywordsStore';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ParsedTradeData) => void;
}

type ImportType = 'image' | 'text';

const STRATEGY_OPTIONS = [
  { value: 'cloudflare-ai', label: 'Cloudflare AI（推荐，精度最高）' },
  { value: 'tesseract', label: 'Tesseract.js（本地识别，无需网络）' },
  { value: 'mock', label: 'Mock（测试用）' },
];

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const [step, setStep] = useState<'upload' | 'parsing' | 'preview'>('upload');
  const [importType, setImportType] = useState<ImportType>('image');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTradeData & { amountValues?: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState(ocrManager.getConfig().strategy);
  const [textInput, setTextInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // 关键词配置相关
  const [showKeywordSettings, setShowKeywordSettings] = useState(false);
  const { keywords, setKeywords, loadKeywords } = useHeaderKeywordsStore();
  const [tempKeywords, setTempKeywords] = useState<Record<string, string>>({ ...DEFAULT_HEADER_KEYWORDS });
  
  // 编辑状态
  const [editOpenDate, setEditOpenDate] = useState<string>('');
  const [editStockCode, setEditStockCode] = useState<string>('');
  const [editStockName, setEditStockName] = useState<string>('');
  const [editHoldDays, setEditHoldDays] = useState<number | null>(null);
  // 盈亏计算相关的三个输入
  const [editAmounts, setEditAmounts] = useState<string>('');
  const [editNegativeAmounts, setEditNegativeAmounts] = useState<string>('');
  const [calculatedProfit, setCalculatedProfit] = useState<number | null>(null);
  // 最终数据
  const [finalOpenDate, setFinalOpenDate] = useState<string>('');
  const [finalStockCode, setFinalStockCode] = useState<string>('');
  const [finalStockName, setFinalStockName] = useState<string>('');
  const [finalProfit, setFinalProfit] = useState<number | null>(null);
  const [finalHoldDays, setFinalHoldDays] = useState<number | null>(null);
  
  // 每次打开模态框时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setStep('upload');
      setImportType('image');
      setImagePreview(null);
      setTextInput('');
      setParsedData(null);
      setError(null);
      setSelectedStrategy(ocrManager.getConfig().strategy);
      // 加载关键词配置
      loadKeywords();
      // 初始化临时关键词为当前关键词
      setTempKeywords({ ...keywords });
    }
  }, [isOpen]);
  
  // 当识别结果返回时，初始化编辑状态
  useEffect(() => {
    if (parsedData) {
      setEditOpenDate(parsedData.openDate || '');
      setEditStockCode(parsedData.stockCode || '');
      setEditStockName(parsedData.stockName || '');
      setEditHoldDays(parsedData.holdDays ?? null);
      
      // 初始化金额表达式
      if (parsedData.amountValues && parsedData.amountValues.length > 0) {
        // 第一行：所有金额，用 + 连接
        const allAmountsStr = parsedData.amountValues.map(amount => 
          amount >= 0 ? amount.toString() : `(${amount.toString()})`
        ).join(' + ');
        setEditAmounts(allAmountsStr);
        
        // 第二行：所有负数金额
        const negativeAmounts = parsedData.amountValues.filter(amount => amount < 0);
        const negativeAmountsStr = negativeAmounts.map(amount => 
          `(${amount.toString()})`
        ).join(' + ');
        setEditNegativeAmounts(negativeAmountsStr);
        
        // 第三行：自动计算
        recalculateProfit(allAmountsStr, negativeAmountsStr);
      }
      
      // 初始化最终数据
      setFinalOpenDate(parsedData.openDate || '');
      setFinalStockCode(parsedData.stockCode || '');
      setFinalStockName(parsedData.stockName || '');
      setFinalHoldDays(parsedData.holdDays ?? null);
    }
  }, [parsedData]);
  
  // 监听编辑变化，自动同步到最终数据
  useEffect(() => {
    setFinalOpenDate(editOpenDate);
    setFinalStockCode(editStockCode);
    setFinalStockName(editStockName);
    setFinalHoldDays(editHoldDays);
  }, [editOpenDate, editStockCode, editStockName, editHoldDays]);
  
  // 当金额表达式变化时重新计算
  useEffect(() => {
    recalculateProfit(editAmounts, editNegativeAmounts);
  }, [editAmounts, editNegativeAmounts]);
  
  // 从表达式重新计算盈亏
  const recalculateProfit = (allAmountsStr: string, negativeAmountsStr: string) => {
    try {
      // 解析第一行：所有金额的总和
      const allAmounts = parseAmountsFromString(allAmountsStr);
      const totalSum = allAmounts.reduce((sum, num) => sum + num, 0);
      
      // 解析第二行：负数金额绝对值总和
      const negativeAmounts = parseAmountsFromString(negativeAmountsStr);
      const negativeAbsSum = Math.abs(negativeAmounts.reduce((sum, num) => sum + num, 0));
      
      let profit: number | null = null;
      if (negativeAbsSum !== 0) {
        profit = (totalSum / negativeAbsSum) * 100;
        profit = Math.round(profit * 100) / 100; // 乘以100后保留2位小数
      }
      
      setCalculatedProfit(profit);
      setFinalProfit(profit);
      
    } catch (e) {
      console.error('表达式计算失败:', e);
      setCalculatedProfit(null);
      setFinalProfit(null);
    }
  };
  
  // 从字符串中解析出数字
  const parseAmountsFromString = (str: string): number[] => {
    const numbers: number[] = [];
    const matches = str.match(/\(?\-?\d+\.?\d*\)?/g) || [];
    
    for (const match of matches) {
      const cleaned = match.replace(/[()]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
    
    return numbers;
  };
  
  // 监听粘贴事件
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 严格检查：只有在 upload 阶段才允许粘贴
      if (!isOpen || step !== 'upload') {
        return;
      }
      
      const text = e.clipboardData?.getData('text/plain');
      if (text && importType === 'text') {
        e.preventDefault();
        setTextInput(text);
        return;
      }
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      // 查找图片项
      for (const item of items) {
        if (item.type.startsWith('image/') && importType === 'image') {
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
  }, [isOpen, step, selectedStrategy, importType]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 只有在 upload 阶段才处理文件选择
    if (step !== 'upload' || importType !== 'image') return;
    
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
      
      if (selectedStrategy === 'cloudflare-ai') {
        // Cloudflare AI 需要通过后端 API
        console.log('使用 Cloudflare AI 策略，上传文件...');
        const formData = new FormData();
        formData.append('image', file);
        formData.append('strategy', selectedStrategy);

        const response = await fetch('/api/parse-trade-image', {
          method: 'POST',
          body: formData
        });

        const jsonResult = await response.json();
        console.log('Cloudflare AI 响应:', jsonResult);
        
        if (!jsonResult.success) {
          throw new Error(jsonResult.error || '识别失败');
        }
        
        result = jsonResult.data;
      } else {
        // Tesseract 或 Mock 在前端处理
        console.log('使用本地策略:', selectedStrategy);
        const ocrResult = await ocrManager.parseImage(file);
        console.log('本地策略结果:', ocrResult);
        
        if (ocrResult.success && ocrResult.data) {
          result = ocrResult.data.structuredData;
        } else {
          throw new Error(ocrResult.error || '识别失败');
        }
      }

      console.log('最终解析结果:', result);
      if (result) {
        setParsedData(result);
        setStep('preview');
      } else {
        throw new Error('识别失败');
      }
    } catch (err) {
      console.error('上传错误:', err);
      setError(err instanceof Error ? err.message : '识别失败，请重试');
      setStep('upload');
    }
  };
  
  const handleParseText = () => {
    if (!textInput.trim()) {
      setError('请输入或粘贴交易记录文本');
      return;
    }
    
    setStep('parsing');
    setError(null);
    
    try {
      const result = parseTradeText(textInput);
      console.log('文本解析结果:', result);
      
      setParsedData(result);
      setStep('preview');
    } catch (err) {
      console.error('文本解析错误:', err);
      setError(err instanceof Error ? err.message : '文本解析失败，请重试');
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
    setImportType('image');
    setImagePreview(null);
    setTextInput('');
    setParsedData(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {importType === 'image' ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            {importType === 'image' ? '从交易截图导入' : '从文本/CSV导入'}
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* 导入方式选择 */}
          {step === 'upload' && (
            <div className="flex gap-2 mb-6">
              <Button
                variant={importType === 'image' ? 'primary' : 'secondary'}
                onClick={() => setImportType('image')}
                className="flex-1"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                从截图导入
              </Button>
              <Button
                variant={importType === 'text' ? 'primary' : 'secondary'}
                onClick={() => setImportType('text')}
                className="flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                从文本导入
              </Button>
            </div>
          )}

          {/* 步骤指示器 */}
          <div className="mb-6">
            <div className="flex items-center justify-center space-x-1 text-xs">
              {[
                { step: 1, label: importType === 'image' ? '选择策略' : '选择方式', active: step === 'upload', done: false },
                { step: 2, label: importType === 'image' ? '上传图片' : '粘贴文本', active: step === 'upload', done: false },
                { step: 3, label: importType === 'image' ? '识别图片' : '解析数据', active: step === 'parsing', done: step === 'preview' },
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
              {/* 图片导入方式 */}
              {importType === 'image' && (
                <>
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
                      onChange={(e) => setSelectedStrategy(e.target.value as any)}
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
                          ✓ 本地识别，无需网络。
                        </div>
                      )}
                      {selectedStrategy === 'cloudflare-ai' && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                          ✓ 使用 AI 视觉模型，识别精度最高。需要网络。
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
                </>
              )}
              
              {/* 文本导入方式 */}
              {importType === 'text' && (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 flex-1">
                      <div className="mt-0.5">①-②</div>
                      <div>
                        <h4 className="font-medium text-blue-800 text-sm">粘贴交易记录文本</h4>
                        <p className="text-xs text-blue-700 mt-1">
                          支持从券商软件复制的制表符分隔数据，或 CSV 格式
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setTempKeywords({ ...keywords });
                        setShowKeywordSettings(true);
                      }}
                      className="ml-2"
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      配置关键词
                    </Button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      粘贴或输入交易记录
                    </label>
                    <textarea
                      ref={textAreaRef}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="在此粘贴您的交易记录文本...

示例：
成交日期	证券代码	证券名称	发生金额
20260303	000560	我爱我家	9774.28
20260303	000560	我爱我家	9774.28
20260302	000560	我爱我家	-6460.55"
                      className="w-full h-64 border rounded p-3 font-mono text-sm resize-y"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button onClick={handleParseText} disabled={!textInput.trim()}>
                        <FileText className="h-4 w-4 mr-2" />
                        解析数据
                      </Button>
                      <Button variant="secondary" onClick={() => setTextInput('')}>
                        清空
                      </Button>
                    </div>
                  </div>
                </>
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
                  <h4 className="font-medium text-blue-800 text-sm">
                    步骤3：{importType === 'image' ? '根据规则识别图片' : '解析文本数据'}
                  </h4>
                  <p className="text-xs text-blue-700 mt-1">
                    {importType === 'image' ? '正在识别表格数据...' : '正在解析数据...'}
                  </p>
                </div>
              </div>
              
              <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
              <p className="text-gray-700">
                {importType === 'image' ? '正在识别表格...' : '正在解析...'}
              </p>
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
              {imagePreview && importType === 'image' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">原截图</label>
                  <img src={imagePreview} alt="原交易截图" className="max-w-full h-auto rounded border max-h-60 object-contain" />
                </div>
              )}
              
              {/* 原文本预览 */}
              {importType === 'text' && textInput && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">原始文本</label>
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm max-h-40 overflow-y-auto font-mono whitespace-pre">
                    {textInput.substring(0, 500)}
                    {textInput.length > 500 ? '...' : ''}
                  </div>
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
                    {/* 盈亏计算（重点）- 三行输入 */}
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600 align-middle">
                        <div className="space-y-1">
                          <div>盈亏计算</div>
                        </div>
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-gray-500">所有发生金额</label>
                            <Input
                              value={editAmounts}
                              onChange={(e) => setEditAmounts(e.target.value)}
                              placeholder="9774.28 + (-6460.55) + (-3310.28) + (-9870.84)"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">所有负数金额</label>
                            <Input
                              value={editNegativeAmounts}
                              onChange={(e) => setEditNegativeAmounts(e.target.value)}
                              placeholder="(-6460.55) + (-3310.28) + (-9870.84)"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">计算盈亏（自动）</label>
                            <div className={`px-3 py-2 border rounded text-sm font-medium
                              ${calculatedProfit && calculatedProfit >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}
                            `}>
                              {calculatedProfit !== null ? calculatedProfit : '-'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 border-l">
                        <div className={`px-3 py-2 border rounded text-sm font-medium
                          ${finalProfit && finalProfit >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}
                        `}>
                          {finalProfit !== null ? finalProfit : '-'}
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
                          {finalHoldDays !== null ? finalHoldDays : '-'}
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

      {/* 关键词配置模态框 */}
      <Modal
        isOpen={showKeywordSettings}
        onClose={() => setShowKeywordSettings(false)}
        title="配置表头关键词"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            设置文本解析时使用的表头关键词，用于确定每列的含义
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                成交日期列
              </label>
              <Input
                value={tempKeywords.date}
                onChange={(e) => setTempKeywords(prev => ({ ...prev, date: e.target.value }))}
                placeholder="成交日期"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                证券代码列
              </label>
              <Input
                value={tempKeywords.code}
                onChange={(e) => setTempKeywords(prev => ({ ...prev, code: e.target.value }))}
                placeholder="证券代码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                证券名称列
              </label>
              <Input
                value={tempKeywords.name}
                onChange={(e) => setTempKeywords(prev => ({ ...prev, name: e.target.value }))}
                placeholder="证券名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                发生金额列
              </label>
              <Input
                value={tempKeywords.amount}
                onChange={(e) => setTempKeywords(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="发生金额"
              />
            </div>
          </div>
          
          <div className="flex justify-between items-center pt-2 border-t">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const resetTo = { ...DEFAULT_HEADER_KEYWORDS };
                setTempKeywords(resetTo);
                setKeywords(resetTo);
              }}
            >
              重置为默认
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowKeywordSettings(false)}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  setKeywords(tempKeywords);
                  setShowKeywordSettings(false);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
