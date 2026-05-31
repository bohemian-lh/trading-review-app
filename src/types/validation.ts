import { z } from 'zod';
import type { TradingRecord, TradingType, YesNo } from './trading';

const TradingTypeSchema = z.enum(['齐飞水底', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致']) satisfies z.ZodType<TradingType>;

const YesNoSchema = z.enum(['是', '否']) satisfies z.ZodType<YesNo>;

export const TradingRecordSchema = z.object({
  id: z.string(),
  openDate: z.string().regex(/^\d{8}$/, '开单时间格式必须为 yyyymmdd'),
  stockName: z.string().min(1, '股票名称不能为空'),
  stockCode: z.string().min(1, '股票代码不能为空'),
  tradingType: TradingTypeSchema,
  isSystem: YesNoSchema,
  hasMistake: YesNoSchema,
  profitPercent: z.number().min(-100, '盈亏不能小于-100%').max(1000, '盈亏不能大于1000%'),
  holdDays: z.number().int().min(0, '持仓天数不能为负数').max(3650, '持仓天数不能超过3650天'),
  chart1: z.string().optional(),
  chart2: z.string().optional(),
  keyChart1: z.string().optional(),
  keyChart2: z.string().optional(),
  preMarket: YesNoSchema,
}) satisfies z.ZodType<TradingRecord>;

export const TradingRecordArraySchema = z.array(TradingRecordSchema);

export const SaveRecordsRequestSchema = z.object({
  records: TradingRecordArraySchema,
  version: z.number().optional(),
});

export interface SaveRecordsRequest {
  records: TradingRecord[];
  version?: number;
}

export interface RecordsResponse {
  success: boolean;
  message: string;
  records?: TradingRecord[];
  version?: number;
  conflict?: boolean;
}

export interface FilesResponse {
  success: boolean;
  files?: Array<{
    key: string;
    filename: string;
    lastModified: Date;
    size: number;
  }>;
}

export interface R2TokenResponse {
  success: boolean;
  uploadUrl?: string;
  downloadUrl?: string;
  expiresAt?: Date;
}
