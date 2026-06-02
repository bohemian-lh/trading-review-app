import { z } from 'zod';
import type { TradingRecord, TradingType, YesNo, MistakeStatus } from './trading';
import type { CustomAnalysisData, CustomMonthlyData, AnalysisResult, MonthlyAnalysis } from './analysis';
import type { CycleStats, CycleStatType } from './cycleStats';

const TradingTypeSchema = z.enum(['齐飞水底', '齐飞前多踩MA', '风险释放平台转一致', '双阳平台转一致', '非系统']) satisfies z.ZodType<TradingType>;

const YesNoSchema = z.enum(['是', '否']) satisfies z.ZodType<YesNo>;

const MistakeStatusSchema = z.enum(['是', '否', '其他']) satisfies z.ZodType<MistakeStatus>;

// 数值或 'N/A' 的 schema
const NumberOrNASchema = z.union([z.number(), z.literal('N/A')]);

// AnalysisResult schema
const AnalysisResultSchema = z.object({
  systemProfitRatio: NumberOrNASchema,
  systemNoMistakeProfitRatio: NumberOrNASchema,
  systemWithMistakeProfitRatio: NumberOrNASchema,
  nonSystemProfitRatio: NumberOrNASchema,
  systemProfitAvgHoldDays: NumberOrNASchema,
  systemLossAvgHoldDays: NumberOrNASchema,
  nonSystemProfitAvgHoldDays: NumberOrNASchema,
  nonSystemLossAvgHoldDays: NumberOrNASchema,
  typeQifeiShuidi: z.number(),
  typeQifeiQianDuoCaiMA: z.number(),
  typeFengxianShifang: z.number(),
  typeShuangyang: z.number(),
  typeFeiXitong: z.number(),
}) satisfies z.ZodType<AnalysisResult>;

// MonthlyAnalysis schema
const MonthlyAnalysisSchema = z.object({
  month: z.string(),
  systemProfitRatio: NumberOrNASchema,
  systemNoMistakeProfitRatio: NumberOrNASchema,
  systemWithMistakeProfitRatio: NumberOrNASchema,
  nonSystemProfitRatio: NumberOrNASchema,
  avgProfitRatio: NumberOrNASchema,
  totalProfit: NumberOrNASchema,
}) satisfies z.ZodType<MonthlyAnalysis>;

// CustomAnalysisData schema
const CustomAnalysisDataSchema = z.object({
  useCustom: z.boolean(),
  data: AnalysisResultSchema,
}) satisfies z.ZodType<CustomAnalysisData>;

// CustomMonthlyData schema
const CustomMonthlyDataSchema = z.object({
  useCustom: z.boolean(),
  data: z.array(MonthlyAnalysisSchema),
}) satisfies z.ZodType<CustomMonthlyData>;

export const TradingRecordSchema = z.object({
  id: z.string(),
  openDate: z.string().regex(/^\d{8}$/, '开单时间格式必须为 yyyymmdd'),
  stockName: z.string().min(1, '股票名称不能为空'),
  stockCode: z.string().min(1, '股票代码不能为空'),
  tradingType: TradingTypeSchema,
  isSystem: YesNoSchema,
  hasMistake: MistakeStatusSchema,
  profitPercent: z.number().min(-100, '盈亏不能小于-100%').max(1000, '盈亏不能大于1000%'),
  holdDays: z.number().int().min(0, '持仓天数不能为负数').max(3650, '持仓天数不能超过3650天'),
  chart1: z.string().optional(),
  chart2: z.string().optional(),
  keyChart1: z.string().optional(),
  keyChart2: z.string().optional(),
  preMarket: YesNoSchema,
  hasCycleStats: z.boolean().default(false),
  hasMonthlyStats: z.boolean().default(false),
  cycleId: z.string().optional(),
}) satisfies z.ZodType<TradingRecord>;

export const TradingRecordArraySchema = z.array(TradingRecordSchema);

export const SaveRecordsRequestSchema = z.object({
  records: TradingRecordArraySchema,
  version: z.number().optional(),
  customAnalysis: CustomAnalysisDataSchema.optional(),
  customMonthly: CustomMonthlyDataSchema.optional(),
  cycleStats: z.record(z.string(), z.array(z.any())).optional(),
  cycleStatsGeneratedAt: z.number().optional(),
});

export interface SaveRecordsRequest {
  records: TradingRecord[];
  version?: number;
  customAnalysis?: CustomAnalysisData;
  customMonthly?: CustomMonthlyData;
  cycleStats?: Record<CycleStatType, CycleStats[]>;
  cycleStatsGeneratedAt?: number | null;
}

export interface RecordsResponse {
  success: boolean;
  message: string;
  records?: TradingRecord[];
  version?: number;
  customAnalysis?: CustomAnalysisData;
  customMonthly?: CustomMonthlyData;
  cycleStats?: Record<CycleStatType, CycleStats[]>;
  cycleStatsGeneratedAt?: number | null;
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
