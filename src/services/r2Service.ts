import type { StorageFile, UploadProgress, TradingRecord, CustomAnalysisData, CustomMonthlyData, MonthlyAnalysis, CycleStats, CycleStatType, FieldConfig, Dataset, AnalysisTab, StressSeries } from '@/types';
import type { RecordsResponse } from '@/types/validation';

const API_BASE_URL = '';

/**
 * 记录保存载荷（增量）
 * 只有真正变化的记录 / 月份才会上行，服务端按主键 upsert + 删除差集，
 * 不再整份响应式覆盖全部记录。
 * 周期统计已上移服务端 SQL，不再经由记录接口写入。
 */
export interface RecordsSavePayload {
  baseVersion: number;
  upserts?: TradingRecord[];
  deletes?: string[];
  customAnalysis?: CustomAnalysisData;
  monthlyUpserts?: MonthlyAnalysis[];
  monthlyDeletes?: string[];
  monthlyUseCustom?: boolean;
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

export interface RecordQueryOptions {
  cursor?: string | null;
  limit?: number;
  /** 排序键：开单日（默认）或股票代码 */
  sortKey?: 'openDate' | 'stockCode';
  /** 页码分页：与 cursor 互斥，传了 offset 就按 LIMIT/OFFSET 取页 */
  offset?: number;
  sort?: 'asc' | 'desc';
  fromDay?: string;
  toDay?: string;
  code?: string;
  keyword?: string;
  tradingType?: string;
  /** 趋势特征 / 模式特征：JSON 数组包含判断 */
  trendFeature?: string;
  patternFeature?: string;
  /** 首屏才带元信息（版本 / 月份选项 / 派生数据），筛选取页不再重复拉 */
  meta?: boolean;
}

export interface RecordsPageResult {
  success: boolean; message: string;
  records?: TradingRecord[]; version?: number; total?: number; nextCursor?: string | null;
  /** 数据集全量条数（不受筛选影响），仅在 meta 请求时返回 */
  datasetTotal?: number;
  /** 月份筛选项（YYYYMM），仅在 meta 请求时返回 */
  months?: string[];
  customAnalysis?: CustomAnalysisData; customMonthly?: CustomMonthlyData;
  cycleStats?: Record<CycleStatType, CycleStats[]>; cycleStatsGeneratedAt?: number | null;
  conflict?: boolean;
  /** 覆盖导入的真实影响面 */
  replaced?: number; removed?: number;
}

export interface RecordSaveResult {
  success: boolean; message: string; version?: number; conflict?: boolean;
  records?: TradingRecord[]; customAnalysis?: CustomAnalysisData;
  customMonthly?: CustomMonthlyData; cycleStats?: Record<CycleStatType, CycleStats[]>;
  cycleStatsGeneratedAt?: number | null; error?: string;
  replaced?: number; removed?: number;
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
   * 筛选与排序全部下推服务端，前端只拿当前页。
   */
  async getRecords(datasetId: string, options: RecordQueryOptions = {}): Promise<RecordsPageResult> {
    try {
      const params = new URLSearchParams({ dataset: datasetId, limit: String(options.limit ?? 20) });
      if (options.cursor) params.set('cursor', options.cursor);
      if (options.sortKey) params.set('sortKey', options.sortKey);
      if (typeof options.offset === 'number' && options.offset > 0) params.set('offset', String(options.offset));
      if (options.sort) params.set('sort', options.sort);
      if (options.fromDay) params.set('from', options.fromDay);
      if (options.toDay) params.set('to', options.toDay);
      if (options.code) params.set('code', options.code);
      if (options.keyword) params.set('keyword', options.keyword);
      if (options.tradingType) params.set('tradingType', options.tradingType);
      if (options.trendFeature) params.set('trendFeature', options.trendFeature);
      if (options.patternFeature) params.set('patternFeature', options.patternFeature);
      if (options.meta) params.set('meta', '1');
      const response = await fetch(`${API_BASE_URL}/api/records?${params.toString()}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data as unknown as RecordsPageResult;
    } catch (error) {
      console.error('Get records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 全量覆盖（导入用）：服务端会按 id 差量落库，并删除不在列表中的记录。
   * 只有「用户明确要求整体替换」时才用这个入口。
   */
  async replaceRecords(
    datasetId: string,
    records: TradingRecord[],
    extra: { customAnalysis?: CustomAnalysisData; customMonthly?: CustomMonthlyData } = {},
  ): Promise<RecordSaveResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records?dataset=${encodeURIComponent(datasetId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ records, ...extra }),
      });
      const data = await this.handleResponse<RecordsResponse>(response);
      return data as unknown as RecordSaveResult;
    } catch (error) {
      console.error('Replace records failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async saveRecords(
    datasetId: string,
    payload: RecordsSavePayload,
    keepalive = false,
  ): Promise<RecordSaveResult> {
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
