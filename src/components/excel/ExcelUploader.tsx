import React, { useCallback, useState, useEffect } from 'react';
import { Upload, Download, FileSpreadsheet, Plus, Check, X, Wifi, WifiOff, RefreshCw, Trash2, FileText } from 'lucide-react';
import { Button, Modal } from '@/components/common';
import { parseExcelFile, exportAllToExcel, type ImportTableType, type ImportMode, type ImportOptions } from '@/services/excelService';
import { useDataStore, useAnalysisResult, useMonthlyAnalysis } from '@/stores';
import { r2StorageService } from '@/services/r2Service';
import type { TradingRecord, StorageFile, UploadProgress } from '@/types';

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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState<string>('');
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadToR2, setUploadToR2] = useState(true);

  const {
    records,
    setLoading,
    setError,
    currentFileName,
  } = useDataStore();
  const analysis = useAnalysisResult();
  const monthlyAnalysis = useMonthlyAnalysis();

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const filesList = await r2StorageService.listFiles();
      setFiles(filesList);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleTestConnection = useCallback(async () => {
    setConnectionStatus('testing');
    setConnectionMessage('正在测试连接...');

    try {
      console.log('Testing R2 connection...');
      const result = await r2StorageService.getRecords();
      console.log('Connection test result:', result);

      if (result.success) {
        setConnectionStatus('success');
        setConnectionMessage(`连接成功！R2 中有 ${result.records?.length || 0} 条记录`);
      } else {
        setConnectionStatus('error');
        setConnectionMessage(`连接失败: ${result.message}`);
      }
    } catch (err) {
      setConnectionStatus('error');
      setConnectionMessage(`连接错误: ${err instanceof Error ? err.message : '未知错误'}`);
    }

    setTimeout(() => {
      setConnectionStatus('idle');
      setConnectionMessage('');
    }, 5000);
  }, []);

  const processFile = useCallback(async (file: File) => {
    console.log('Processing file:', file.name);
    setFileToImport(file);
    setPreviewData(null);

    const options: ImportOptions = {
      tables: [selectedTable],
      mode: importMode,
    };

    console.log('Import options:', options);
    console.log('selectedTable:', selectedTable, 'type:', typeof selectedTable);

    setLoading(true);
    setError(null);

    try {
      const result = await parseExcelFile(file, options);
      console.log('Parse result:', JSON.stringify(result, null, 2));

      const recordCount = result.records?.length || 0;
      console.log('Record count:', recordCount);

      if (result.errors && result.errors.length > 0) {
        console.log('Parse errors:', result.errors);
      }

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
    console.log('handleConfirmImport called');
    console.log('previewData:', previewData);
    console.log('records currently in store:', records.length);
    console.log('importMode:', importMode);

    if (!previewData?.records || previewData.records.length === 0) {
      console.log('No records to import, showing error');
      setError('没有可导入的记录');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 首先上传文件到R2（如果选择了）
      if (uploadToR2 && fileToImport) {
        await handleUploadToR2(fileToImport);
      }

      let newRecords: TradingRecord[];

      if (importMode === 'overwrite') {
        console.log('Using overwrite mode, new records:', previewData.records.length);
        newRecords = previewData.records;
      } else {
        console.log('Using append mode, existing:', records.length, 'new:', previewData.records.length);
        newRecords = [...records, ...previewData.records];
      }

      console.log('Saving to R2, total records:', newRecords.length);
      const saveResult = await r2StorageService.saveRecords(newRecords);
      console.log('Save result:', saveResult);

      if (!saveResult.success) {
        throw new Error(saveResult.message);
      }

      useDataStore.setState({
        records: newRecords,
        currentFileName: fileToImport?.name || null,
        error: null
      });

      console.log('Import completed successfully');
      setIsModalOpen(false);
      setPreviewData(null);
      setFileToImport(null);
    } catch (err) {
      console.error('Import failed:', err);
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

  const handleUploadToR2 = useCallback(async (file: File) => {
    try {
      setUploadProgress({
        filename: file.name,
        progress: 0,
        status: 'uploading',
      });

      const uploadedFile = await r2StorageService.uploadFile(
        file,
        (progress) => setUploadProgress({ ...progress })
      );

      setUploadProgress(null);
      await loadFiles();
      
      return uploadedFile;
    } catch (error) {
      console.error('Failed to upload file:', error);
      setUploadProgress(null);
      throw error;
    }
  }, [loadFiles]);

  const handleDownloadFromR2 = useCallback(async (file: StorageFile) => {
    try {
      const blob = await r2StorageService.downloadFile(file.filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      setError('下载文件失败');
    }
  }, [setError]);

  const handleDeleteFromR2 = useCallback(async (file: StorageFile) => {
    if (!window.confirm(`确定要删除文件 "${file.filename}" 吗？`)) {
      return;
    }
    
    try {
      await r2StorageService.deleteFile(file.filename);
      await loadFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      setError('删除文件失败');
    }
  }, [loadFiles, setError]);

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
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${
                      selectedTable === table.value ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {table.label}
                    </p>
                    <p className="text-xs text-gray-500">{table.description}</p>
                  </div>
                  {selectedTable === table.value && (
                    <Check className="h-5 w-5 text-blue-500" />
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
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${
                      importMode === mode.value ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {mode.label}
                    </p>
                    <p className="text-xs text-gray-500">{mode.description}</p>
                  </div>
                  {importMode === mode.value && (
                    <Check className="h-5 w-5 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700">R2 数据库连接测试</h3>
            {connectionStatus === 'success' && <Wifi className="h-4 w-4 text-green-500" />}
            {connectionStatus === 'error' && <WifiOff className="h-4 w-4 text-red-500" />}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestConnection}
            disabled={connectionStatus === 'testing'}
          >
            {connectionStatus === 'testing' ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                测试连接
              </>
            )}
          </Button>
        </div>
        {connectionMessage && (
          <div className={`mt-2 text-xs ${connectionStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {connectionMessage}
          </div>
        )}
        <div className="mt-2 text-xs text-gray-500">
          API 地址: {import.meta.env.VITE_API_BASE_URL || '相对路径 (同一域名)'}
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
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
            className="inline-flex items-center justify-center px-4 py-2 text-base font-medium rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            <Upload className="mr-2 h-4 w-4" />
            选择文件
          </label>
        </div>
      </div>

      {/* 上传进度显示 */}
      {uploadProgress && (
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">
              {uploadProgress.status === 'uploading' ? '正在上传' : 
               uploadProgress.status === 'completed' ? '上传完成' : '上传失败'}: {uploadProgress.filename}
            </span>
            <span className="text-sm text-blue-600">{uploadProgress.progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
          {uploadProgress.error && (
            <p className="text-sm text-red-600 mt-2">{uploadProgress.error}</p>
          )}
        </div>
      )}

      {/* 文件列表 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">已上传的 Excel 文件</h3>
          <Button variant="secondary" size="sm" onClick={loadFiles} disabled={isLoadingFiles}>
            {isLoadingFiles ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            刷新
          </Button>
        </div>
        
        {isLoadingFiles ? (
          <div className="text-center py-8 text-gray-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            暂无上传的文件
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.filename}</p>
                    <p className="text-xs text-gray-500">
                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''} 
                      {file.lastModified ? ` · ${new Date(file.lastModified).toLocaleString()}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="secondary" size="sm" onClick={() => handleDownloadFromR2(file)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleDeleteFromR2(file)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
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
          <div className="flex items-center space-x-2">
            <Button variant="secondary" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              导出 Excel
            </Button>
          </div>
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

          {/* 上传到R2选项 */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="uploadToR2"
              checked={uploadToR2}
              onChange={(e) => setUploadToR2(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="uploadToR2" className="text-sm text-gray-700">
              同时上传文件到 R2 存储
            </label>
          </div>

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