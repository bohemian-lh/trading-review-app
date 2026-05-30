export interface StorageFile {
  key: string;
  filename: string;
  lastModified: Date;
  size: number;
  downloadUrl?: string;
}

export interface UploadProgress {
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface R2Config {
  accountId: string;
  bucketName: string;
  region: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  downloadUrl: string;
  expiresAt: Date;
}
