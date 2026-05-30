import type { StorageFile, UploadProgress, TradingRecord, AnalysisResult, MonthlyAnalysis } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class R2StorageService {
  private accessToken: string;

  constructor() {
    this.accessToken = import.meta.env.VITE_R2_ACCESS_TOKEN || '';
  }

  async listFiles(): Promise<StorageFile[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/files`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`获取文件列表失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('列出文件失败:', error);
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
      onProgress?.({ ...progress, status: 'uploading', progress: 10 });

      const uploadUrlResponse = await fetch(
        `${API_BASE_URL}/api/r2-token?action=upload&filename=${encodeURIComponent(file.name)}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!uploadUrlResponse.ok) {
        throw new Error('获取上传URL失败');
      }

      const { uploadUrl } = await uploadUrlResponse.json();
      onProgress?.({ ...progress, status: 'uploading', progress: 30 });

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('上传文件失败');
      }

      onProgress?.({ ...progress, status: 'uploading', progress: 90 });

      const result: StorageFile = {
        key: file.name,
        filename: file.name,
        lastModified: new Date(),
        size: file.size,
      };

      onProgress?.({ ...progress, status: 'completed', progress: 100 });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      onProgress?.({ ...progress, status: 'error', error: errorMessage });
      throw error;
    }
  }

  async downloadFile(filename: string): Promise<Blob> {
    try {
      const downloadUrlResponse = await fetch(
        `${API_BASE_URL}/api/r2-token?action=download&filename=${encodeURIComponent(filename)}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!downloadUrlResponse.ok) {
        throw new Error('获取下载URL失败');
      }

      const { downloadUrl } = await downloadUrlResponse.json();

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error('下载文件失败');
      }

      return await response.blob();
    } catch (error) {
      throw new Error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async deleteFile(filename: string): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/files/${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error('删除文件失败');
      }
    } catch (error) {
      throw new Error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async getRecords(): Promise<{
    success: boolean;
    message: string;
    records?: TradingRecord[];
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '获取记录失败');
      }

      return await response.json();
    } catch (error) {
      console.error('获取记录失败:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async saveRecords(records: TradingRecord[]): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/records`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ records }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '保存记录失败');
      }

      return await response.json();
    } catch (error) {
      console.error('保存记录失败:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async updateStats(records: TradingRecord[]): Promise<{
    success: boolean;
    message: string;
    analysis?: AnalysisResult;
    monthlyAnalysis?: MonthlyAnalysis[];
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/update-stats`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ records }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '更新统计数据失败');
      }

      return await response.json();
    } catch (error) {
      console.error('更新统计数据失败:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
    };
  }
}

export const r2StorageService = new R2StorageService();
