import React, { useCallback, useState } from 'react';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/common';
import { parseExcelFile, exportToExcel } from '@/services/excelService';
import { useDataStore } from '@/stores';

export const ExcelUploader: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const { setRecords, setLoading, setError, records, currentFileName } = useDataStore();

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);

      try {
        const result = await parseExcelFile(file);
        if (result.errors.length > 0) {
          console.warn('解析警告:', result.errors);
        }
        setRecords(result.records);
        useDataStore.getState().setCurrentFileName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析文件失败');
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setRecords]
  );

  const handleExport = useCallback(() => {
    if (records.length === 0) {
      setError('没有数据可导出');
      return;
    }
    exportToExcel(records, currentFileName || '交易复盘数据.xlsx');
  }, [records, currentFileName, setError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);

      try {
        const result = await parseExcelFile(file);
        if (result.errors.length > 0) {
          console.warn('解析警告:', result.errors);
        }
        setRecords(result.records);
        useDataStore.getState().setCurrentFileName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析文件失败');
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setRecords]
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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
    </div>
  );
};
