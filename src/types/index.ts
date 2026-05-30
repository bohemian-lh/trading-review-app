export * from './trading';
export * from './analysis';
export * from './storage';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  row?: number;
}

export interface AppError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}
