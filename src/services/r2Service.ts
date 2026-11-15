import type { StorageFile, UploadProgress, TradingRecord, CustomAnalysisData, CustomMonthlyData, MonthlyAnalysis, CycleStats, CycleStatType, FieldConfig, Dataset, AnalysisTab, StressSeries } from '@/types';
import type { RecordsResponse } from '@/types/validation';

const API_BASE_URL = '';

/**
 * 记录保存载荷（增量）
 * 只有真正变化的记录 / 月份 / 周期才会上行，服务端按主键 upsert + 删除差集，
 * 不再整份响应式覆盖全部记录。
 */
export interface RecordsSavePayload {
  baseVersion: number;
  upserts?: TradingRecord[];
  deletes?: string[];
  customAnalysis?: CustomAnalysisData;
  monthlyUpserts?: MonthlyAnalysis[];
  monthlyDeletes?: string[];
  monthlyUseCustom?: boolean;
  cycleStatsUpserts?: CycleStats[];
  cycleStatsDeletes?: { statType: CycleStatType; cycleId: string }[];
  cycleStatsGeneratedAt?: number | null;
}

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

  // 删除数据集已从前端移除：高危操作只能在数据库里标记 deleted_at 后由管理端点分批清理

  // ============ 记录读写（带 datasetId） ============

  /**
   * 键集分页读取记录。
   * 首页（不传 cursor）同时返回 version / total 与派生数据（自定义分析、月度、周期统计）。
   */
  async getRecords(datasetId: string, cursor?: string | null, limit = 20): Promise<{
    success: boolean; message: string;
    records?: TradingRecord[]; version?: number; total?: number; nextCursor?: string | null;
    customAnalysis?: CustomAnalysisData; customMonthly?: CustomMonthlyData;
    cycleStats?: Record<CycleStatType, CycleStats[]>; cycleStatsGeneratedAt?: number | null;
    conflict?: boolean;
  }> {
    try {
      const params = new URLSearchParams({ dataset: datasetId, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`${API_BASE_URL}/api/records?${params.toString()}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data as any;
    } catch (error) {
      console.error('Get records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveRecords(
    datasetId: string,
    payload: RecordsSavePayload,
    keepalive = false,
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
        body: JSON.stringify(payload),
        keepalive,
      });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data;
    } catch (error) {
      console.error('Save records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getConfig(datasetId: string): Promise<{
    success: boolean; config?: FieldConfig | null; version?: number; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config?dataset=${encodeURIComponent(datasetId)}`, { method: 'GET', headers: this.getHeaders() });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Get config failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveConfig(datasetId: string, config: FieldConfig, baseVersion?: number | null): Promise<{
    success: boolean; message: string; version?: number; conflict?: boolean; config?: FieldConfig | null;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ config, baseVersion: baseVersion ?? undefined }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Save config failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ============ 分析页签管理（dataset 级） ============

  async getTabs(datasetId: string): Promise<{
    success: boolean; tabs?: AnalysisTab[]; version?: number; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tabs?dataset=${encodeURIComponent(datasetId)}`, { method: 'GET', headers: this.getHeaders() });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Get tabs failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveTabs(datasetId: string, tabs: AnalysisTab[], baseVersion?: number | null): Promise<{
    success: boolean; message: string; version?: number; conflict?: boolean; tabs?: AnalysisTab[];
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tabs?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ tabs, baseVersion: baseVersion ?? undefined }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Save tabs failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ============ 压测对比系列管理（dataset 级） ============

  async getStressSeries(datasetId: string): Promise<{
    success: boolean; series?: StressSeries[]; version?: number; message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stress-series?dataset=${encodeURIComponent(datasetId)}`, { method: 'GET', headers: this.getHeaders() });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Get stress series failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveStressSeries(datasetId: string, series: StressSeries[], baseVersion?: number | null): Promise<{
    success: boolean; message: string; version?: number; conflict?: boolean; series?: StressSeries[];
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stress-series?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ series, baseVersion: baseVersion ?? undefined }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('Save stress series failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const r2StorageService = new R2StorageService();
