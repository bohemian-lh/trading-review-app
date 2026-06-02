import type { StorageFile, UploadProgress, TradingRecord, CustomAnalysisData, CustomMonthlyData, CycleStats, CycleStatType } from '@/types';
import type { RecordsResponse } from '@/types/validation';

// 确保使用相对路径，在同一域名下直接请求
const API_BASE_URL = '';

interface FilesResponse {
  success: boolean;
  files?: StorageFile[];
}

interface UploadResponse {
  success: boolean;
  message: string;
  key: string;
  filename: string;
}

class R2StorageService {

  private getHeaders(includeContentType = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    // 临时：不发送 Authorization 头
    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let data: T;
    
    try {
      data = text ? JSON.parse(text) : {} as T;
    } catch {
      throw new Error(`Invalid JSON response: ${text}`);
    }

    // 409冲突响应不抛错误，因为我们需要保留conflict、records和version信息
    if (!response.ok && response.status !== 409) {
      const errorMessage = (data as any)?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  }

  async listFiles(): Promise<StorageFile[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/files`, {
        headers: this.getHeaders(),
      });

      const data = await this.handleResponse<FilesResponse>(response);
      return data.files || [];
    } catch (error) {
      console.error('Listing files failed:', error);
      return [];
    }
  }

  async uploadFile(file: File, onProgress?: (progress: UploadProgress) => void): Promise<StorageFile> {
    const progress: UploadProgress = {
      filename: file.name,
      progress: 0,
      status: 'uploading',
    };

    try {
      onProgress?.({ ...progress, progress: 10 });

      const formData = new FormData();
      formData.append('file', file);

      onProgress?.({ ...progress, progress: 30 });

      const response = await fetch(`${API_BASE_URL}/api/files`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(false),
        },
        body: formData,
      });

      onProgress?.({ ...progress, progress: 70 });

      const data = await this.handleResponse<UploadResponse>(response);

      if (!data.success) {
        throw new Error(data.message || 'Upload failed');
      }

      onProgress?.({ ...progress, progress: 100, status: 'completed' });

      return {
        key: data.key,
        filename: data.filename,
        lastModified: new Date(),
        size: file.size,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ ...progress, status: 'error', error: errorMessage });
      throw error;
    }
  }

  async downloadFile(filename: string): Promise<Blob> {
    console.log('=== r2StorageService.downloadFile START ===');
    console.log('Downloading filename:', filename);
    console.log('Request URL:', `${API_BASE_URL}/api/file?filename=${encodeURIComponent(filename)}`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/file?filename=${encodeURIComponent(filename)}`, {
        headers: this.getHeaders(false),
      });

      console.log('Download response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download error response:', errorText);
        throw new Error(`Download failed: HTTP ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      console.log('Download completed, blob size:', blob.size);
      console.log('=== r2StorageService.downloadFile SUCCESS ===');
      return blob;
    } catch (error) {
      console.error('❌ r2StorageService.downloadFile FAILED:', error);
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(filename: string): Promise<void> {
    console.log('=== r2StorageService.deleteFile START ===');
    console.log('Deleting filename:', filename);
    console.log('Request URL:', `${API_BASE_URL}/api/file?filename=${encodeURIComponent(filename)}`);
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/file?filename=${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      console.log('Delete response status:', response.status);
      
      await this.handleResponse(response);
      console.log('=== r2StorageService.deleteFile SUCCESS ===');
    } catch (error) {
      console.error('❌ r2StorageService.deleteFile FAILED:', error);
      throw new Error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRecords(): Promise<{
    success: boolean;
    message: string;
    records?: TradingRecord[];
    version?: number;
    conflict?: boolean;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await this.handleResponse<RecordsResponse>(response);
      return data;
    } catch (error) {
      console.error('Get records failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async saveRecords(
    records: TradingRecord[], 
    version?: number,
    customAnalysis?: CustomAnalysisData,
    customMonthly?: CustomMonthlyData,
    cycleStats?: Record<CycleStatType, CycleStats[]>,
    cycleStatsGeneratedAt?: number | null
  ): Promise<{
    success: boolean;
    message: string;
    version?: number;
    conflict?: boolean;
    records?: TradingRecord[];
    customAnalysis?: CustomAnalysisData;
    customMonthly?: CustomMonthlyData;
    cycleStats?: Record<CycleStatType, CycleStats[]>;
    cycleStatsGeneratedAt?: number | null;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ records, version, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt }),
      });

      const data = await this.handleResponse<RecordsResponse>(response);
      return data;
    } catch (error) {
      console.error('Save records failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const r2StorageService = new R2StorageService();
