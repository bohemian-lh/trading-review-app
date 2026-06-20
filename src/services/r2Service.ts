import type { StorageFile, UploadProgress, TradingRecord, CustomAnalysisData, CustomMonthlyData, CycleStats, CycleStatType, FieldConfig, Dataset } from '@/types';
import type { RecordsResponse } from '@/types/validation';

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
    if (!response.ok && response.status !== 409) {
      const errorMessage = (data as any)?.error || (data as any)?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }
    return data;
  }

  async listFiles(): Promise<StorageFile[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/files`, { headers: this.getHeaders() });
      const data = await this.handleResponse<FilesResponse>(response);
      return data.files || [];
    } catch (error) {
      console.error('Listing files failed:', error);
      return [];
    }
  }

  async uploadFile(file: File, onProgress?: (progress: UploadProgress) => void): Promise<StorageFile> {
    const progress: UploadProgress = { filename: file.name, progress: 0, status: 'uploading' };
    try {
      onProgress?.({ ...progress, progress: 10 });
      const formData = new FormData();
      formData.append('file', file);
      onProgress?.({ ...progress, progress: 30 });
      const response = await fetch(`${API_BASE_URL}/api/files`, { method: 'POST', headers: { ...this.getHeaders(false) }, body: formData });
      onProgress?.({ ...progress, progress: 70 });
      const data = await this.handleResponse<UploadResponse>(response);
      if (!data.success) throw new Error(data.message || 'Upload failed');
      onProgress?.({ ...progress, progress: 100, status: 'completed' });
      return { key: data.key, filename: data.filename, lastModified: new Date(), size: file.size };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ ...progress, status: 'error', error: errorMessage });
      throw error;
    }
  }

  async downloadFile(key: string): Promise<Blob> {
    const url = `${API_BASE_URL}/api/file?key=${encodeURIComponent(key)}`;
    try {
      const response = await fetch(url, { headers: this.getHeaders(false) });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Download failed: HTTP ${response.status}${text ? ' - ' + text : ''}`);
      }
      return await response.blob();
    } catch (error) {
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    const url = `${API_BASE_URL}/api/file?key=${encodeURIComponent(key)}`;
    try {
      const response = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
      await this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============ 数据集管理 ============

  async getDatasets(): Promise<{
    success: boolean; datasets?: Dataset[]; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets`, { method: 'GET', headers: this.getHeaders() });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Get datasets failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async createDataset(name: string): Promise<{
    success: boolean; dataset?: Dataset; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Create dataset failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async deleteDataset(id: string): Promise<{
    success: boolean; message: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Delete dataset failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ============ 记录读写（带 datasetId） ============

  async getRecords(datasetId: string): Promise<{
    success: boolean; message: string;
    records?: TradingRecord[]; version?: number; conflict?: boolean;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records?dataset=${encodeURIComponent(datasetId)}`, { method: 'GET', headers: this.getHeaders() });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data;
    } catch (error) {
      console.error('Get records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveRecords(
    datasetId: string,
    records: TradingRecord[],
    version?: number,
    customAnalysis?: CustomAnalysisData,
    customMonthly?: CustomMonthlyData,
    cycleStats?: Record<CycleStatType, CycleStats[]>,
    cycleStatsGeneratedAt?: number | null,
  ): Promise<{
    success: boolean; message: string; version?: number; conflict?: boolean;
    records?: TradingRecord[]; customAnalysis?: CustomAnalysisData;
    customMonthly?: CustomMonthlyData; cycleStats?: Record<CycleStatType, CycleStats[]>;
    cycleStatsGeneratedAt?: number | null; error?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ records, version, customAnalysis, customMonthly, cycleStats, cycleStatsGeneratedAt }),
      });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data;
    } catch (error) {
      console.error('Save records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConfig(datasetId: string): Promise<{
    success: boolean; config?: FieldConfig | null; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config?dataset=${encodeURIComponent(datasetId)}`, { method: 'GET', headers: this.getHeaders() });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Get config failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveConfig(datasetId: string, config: FieldConfig): Promise<{
    success: boolean; message: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ config }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Save config failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const r2StorageService = new R2StorageService();
