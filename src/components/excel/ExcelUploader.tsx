import React, { useCallback, useState } from 'react';
import { Upload, Download, FileSpreadsheet, Plus, Check, X } from 'lucide-react';
import { Button, Modal } from '@/components/common';
import { parseExcelFile, exportAllToExcel, type ImportTableType, type ImportMode, type ImportOptions } from '@/services/excelService';
import { useDataStore, useAnalysisResult, useMonthlyAnalysis } from '@/stores';
import type { TradingRecord } from '@/types';

const TABLE_OPTIONS: { value: ImportTableType; label: string; description: string }[] = [
  { value: 'table1', label: '表1-交易复盘数据', description: '基本交易记录数据' },
  { value: 'table2', label: '表2-动态数据分析', description: '总统计数据' },
  { value: 'table3', label: '表3-月度统计', description: '月度统计数据' },
];

const MODE_OPTIONS: { value: ImportMode; label: string; description: string }[] = [
  { value: 'append', label: '追加模式', description: '将导入数据追加到现有数据中' },
  { value: 'overwrite', label: '覆盖模式', description: '删除原有数据，替换为导入数据' },
];

export const ExcelUploader: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<ImportTableType>('table1');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [previewData, setPreviewData] = useState<{
    records?: TradingRecord[];
    recordCount: number;
    errors: string[];
  } | null>(null);
  const [fileToImport, setFileToImport] = useState<File | null>(null);

  const {
    records,
    setRecords,
    addRecords,
    clearRecords,
    setLoading,
    setError,
    currentFileName,
    setCurrentFileName,
  } = useDataStore();
  const analysis = useAnalysisResult();
  const monthlyAnalysis = useMonthlyAnalysis();

  const processFile = useCallback(async (file: File) => {
    console.log('Processing file:', file.name);
    setFileToImport(file);
    setPreviewData(null);

    const options: ImportOptions = {
      tables: [selectedTable],
      mode: importMode,
    };

    setLoading(true);
    setError(null);

    try {
      const result = await parseExcelFile(file, options);
      console.log('Parse result:', result);

      const recordCount = result.records?.length || 0;
      setPreviewData({
        records: result.records,
        recordCount,
        errors: result.errors,
      });

      setIsModalOpen(true);
    } catch (err) {
      console.error('Error parsing file:', err);
      setError(err instanceof Error ? err.message : '解析文件失败');
    } finally {
      setLoading(false);
    }
  }, [selectedTable, importMode, setLoading, setError]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      console.log('File selected:', file.name, file.type);
      processFile(file).then(() => {
        event.target.value = '';
      });
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      console.log('File dropped:', file.name, file.type);
      processFile(file);
    },
    [processFile]
  );

  const handleConfirmImport = async () => {
    if (!previewData?.records || previewData.records.length === 0) {
      setIsModalOpen(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (importMode === 'overwrite') {
        await clearRecords();
      }

      if (importMode === 'append') {
        await addRecords(previewData.records);
      } else {
        await setRecords(previewData.records);
      }

      if (fileToImport) {
        setCurrentFileName(fileToImport.name);
      }

      setIsModalOpen(false);
      setPreviewData(null);
      setFileToImport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = useCallback(() => {
    if (records.length === 0) {
      setError('没有数据可导出');
      return;
    }
    exportAllToExcel(records, analysis, monthlyAnalysis, currentFileName || '交易复盘数据.xlsx');
  }, [records, analysis, monthlyAnalysis, currentFileName, setError]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">导入选项</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">选择要导入的表</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {TABLE_OPTIONS.map((table) => (
                <button
                  key={table.value}
                  onClick={() => setSelectedTable(table.value)}
                  className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                    selectedTable === table.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${
                      selectedTable === table.value ? 'text-primary-700' : 'text-gray-700'
                    }`}>
                      {table.label}
                    </p>
                    <p className="text-xs text-gray-500">{table.description}</p>
                  </div>
                  {selectedTable === table.value && (
                    <Check className="h-5 w-5 text-primary-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">导入模式</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setImportMode(mode.value)}
                  className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                    importMode === mode.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${
                      importMode === mode.value ? 'text-primary-700' : 'text-gray-700'
                    }`}>
                      {mode.label}
                    </p>
                    <p className="text-xs text-gray-500">{mode.description}</p>
                  </div>
                  {importMode === mode.value && (
                    <Check className="h-5 w-5 text-primary-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">拖拽 Excel 文件到此处</h3>
        <p className="mt-1 text-xs text-gray-500">或点击下方按钮选择文件</p>
        <div className="mt-4">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center justify-center px-4 py-2 text-base font-medium rounded-lg transition-colors bg-primary-600 text-white hover:bg-primary-700 cursor-pointer"
          >
            <Upload className="mr-2 h-4 w-4" />
            选择文件
          </label>
        </div>
      </div>

      {records.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {currentFileName || '未命名文件'}
            </p>
            <p className="text-xs text-gray-500">
              共 {records.length} 条交易记录
            </p>
          </div>
          <Button variant="secondary" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出 Excel
          </Button>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="确认导入">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">文件信息</p>
            <p className="text-sm text-gray-600">{fileToImport?.name}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">导入选项</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                导入表：{TABLE_OPTIONS.find((opt) => opt.value === selectedTable)?.label}
              </p>
              <p className="text-sm text-gray-600">
                导入模式：{MODE_OPTIONS.find((opt) => opt.value === importMode)?.label}
              </p>
            </div>
          </div>

          {previewData && previewData.recordCount > 0 && (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-700 mb-2">预览数据</p>
              <p className="text-sm text-blue-600">
                共 {previewData.recordCount} 条记录将被导入
              </p>
            </div>
          )}

          {previewData?.errors && previewData.errors.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-700 mb-2">警告</p>
              <ul className="text-sm text-yellow-600 space-y-1">
                {previewData.errors.map((error, index) => (
                  <li key={index} className="flex items-start">
                    <X className="h-4 w-4 mt-0.5 mr-2 text-yellow-500 flex-shrink-0" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importMode === 'overwrite' && (
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm font-medium text-red-700 mb-1">⚠️ 注意</p>
              <p className="text-sm text-red-600">
                覆盖模式将删除现有的 {records.length} 条记录，此操作不可撤销。
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmImport}>
              <Plus className="mr-2 h-4 w-4" />
              确认导入
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};