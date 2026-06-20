# 交易复盘管理系统

注意：本项目绝大部分代码由AI生成。

基于 React + Cloudflare Pages/R2 的交易数据管理和可视化系统。

## 功能特性

- **多数据集管理**：支持创建、切换、删除数据集，数据按数据集隔离
- **Excel 导入/导出**：支持拖拽上传、覆盖/追加模式、4-Sheet 导出
- **数据编辑**：在线添加、编辑、删除交易记录，含图片粘贴、OCR 识别、文本解析
- **图片管理**：通过 Chrome File System Access API 将截图存储到本地目录，按年份自动分目录
- **动态数据分析**：自动计算盈亏比和平均持仓时间
- **月度趋势图表**：基于 Recharts 的折线图可视化
- **周期统计图表**：每 30 条一个周期，多维度盈亏比趋势对比
- **动态字段配置**：交易类型、切入类型、聚合规则可在线增删
- **云端存储**：集成 Cloudflare R2 对象存储，防抖自动保存
- **代码分割**：React.lazy 按页面懒加载
- **响应式设计**：支持桌面和移动设备

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand（3 个独立 Store）
- **Excel处理**: SheetJS (xlsx)
- **图表库**: Recharts
- **路由**: React Router v6 (lazy loading)
- **校验**: Zod
- **测试**: Vitest
- **图片存储**: Chrome File System Access API + IndexedDB
- **OCR**: Cloudflare Workers AI (llava-1.5-7b-hf)
- **云服务**: Cloudflare Pages + R2 + Workers

## 项目结构

```
trading-review-app/
├── src/
│   ├── components/
│   │   ├── common/            # 通用UI组件 (Button, Input, Select, Modal, Pagination, Toggle, ZoomControls, DatasetSelector)
│   │   ├── config/            # 字段配置页面 (FieldConfigPage)
│   │   ├── excel/             # Excel导入/导出组件 (ExcelUploader)
│   │   ├── editor/            # 数据编辑组件群
│   │   │   ├── DataEditor.tsx           # 编排器（状态管理 + 事件处理）
│   │   │   ├── TradeRecordTable.tsx     # 表1 交易记录表格（筛选/排序/分页）
│   │   │   ├── RecordModal.tsx          # 添加/编辑记录模态框（含图片粘贴）
│   │   │   ├── AnalysisPanel.tsx        # 表2 总数据统计
│   │   │   ├── MonthlyAnalysisPanel.tsx  # 表3 月度盈亏比统计
│   │   │   ├── MonthlyAnalysisModal.tsx  # 月度数据编辑模态框
│   │   │   ├── CycleStatsPanel.tsx       # 表4 周期盈亏比统计
│   │   │   ├── ImportModal.tsx           # 图片/文本导入模态框
│   │   │   └── ImagePreviewModal.tsx     # 图片预览（Portal 渲染）
│   │   ├── charts/            # 图表组件 (6个)
│   │   └── layout/            # 布局组件 (Navigation)
│   ├── pages/
│   │   └── Dashboard.tsx      # 首页仪表盘
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── useStoreSync.ts          # R2 加载/保存/切换/防抖（胶水层）
│   │   ├── useAnalysis.ts           # useAnalysisResult / useMonthlyAnalysis
│   │   ├── useImageDirectory.ts     # Chrome File System Access 图片读写
│   │   ├── useInitializeStore.ts    # 应用初始化
│   │   ├── useTableZoom.ts          # 表格缩放
│   │   ├── useChartConfig.ts        # 图表配置持久化
│   │   └── useChartZoomPan.ts       # 图表缩放/平移
│   ├── services/
│   │   ├── excelService.ts          # Excel解析与生成
│   │   ├── r2Service.ts             # R2存储 API 调用（含数据集CRUD）
│   │   ├── cycleStatsService.ts     # 周期统计计算
│   │   └── text-parser.ts           # 文本交易解析
│   ├── stores/                # Zustand 状态管理（3个独立Store）
│   │   ├── recordsStore.ts          # records + cycleStats + customAnalysis + customMonthly + fieldConfig
│   │   ├── datasetStore.ts          # datasets + currentDatasetId
│   │   ├── uiStore.ts               # isLoading / isSaving / isInitialized / error / currentFileName
│   │   └── headerKeywordsStore.ts   # OCR 表头关键词
│   ├── types/                 # TypeScript 类型定义
│   │   ├── analysis.ts        # AnalysisResult、MonthlyAnalysis
│   │   ├── cycleStats.ts      # CycleStats、CycleStatType
│   │   ├── fieldConfig.ts     # FieldConfig、AggregateRule
│   │   ├── trading.ts         # TradingRecord、TradingType、EntryType、Dataset
│   │   ├── validation.ts      # Zod Schema
│   │   └── storage.ts         # 存储相关类型
│   ├── utils/                 # 工具函数
│   │   ├── calculations.ts    # 盈亏比计算
│   │   ├── validationUtils.ts # 运行时校验
│   │   └── dateUtils.ts       # 日期处理
│   ├── App.tsx                # 主应用（路由 + React.lazy + Suspense）
│   ├── main.tsx               # 入口文件
│   └── index.css              # 全局样式
├── functions/
│   └── api/
│       ├── records.ts         # /api/records 端点
│       ├── datasets.ts        # /api/datasets 端点
│       ├── config.ts          # /api/config 端点
│       └── parse-trade-image.ts  # OCR 端点
├── docs/                      # 设计文档
│   ├── 01-架构设计.md
│   ├── 02-开发手册.md
│   ├── 03-运维手册.md
│   └── 04-统计计算全流程手册.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── wrangler.toml.example
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发模式（推荐）

```bash
npm run dev:cf
```

访问 http://localhost:5173

### 纯 Vite 开发模式（API 不可用）

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
npm test
```

## 数据分析逻辑

### 盈亏比计算

- **全部盈利（无亏损）**: 盈利之和 / 1.00
- **全部亏损（无盈利）**: -|亏损之和| / 1.00
- **盈利多**: |总盈利| / |总亏损| → 正值
- **亏损多**: -|总亏损| / |总盈利| → 负值
- 保留 2 位小数

### 分析维度

#### 固定维度
- 符合系统 / 系统无失误 / 系统有失误 / 非系统 盈亏比
- 系统/非系统 盈利/亏损平均持仓天数
- 按交易类型盈亏比（齐飞水底、齐飞水底三等量、齐飞前多踩MA、风险释放平台转一致、双阳平台转一致）
- 聚合盈亏比（齐飞水底总、转一致）

#### 动态维度（从 FieldConfig 驱动）
- **交易类型盈亏比**: tradingTypeRatios
- **交易切入类型盈亏比**: entryTypeRatios
- **聚合规则盈亏比**: aggregateRatios

### 月度数据分析

基于 `开单时间` 提取 `yyyymm` 格式的月数，自动按月聚合计算各项指标。

### 周期统计

每 30 条匹配记录为一个周期，支持 11 个维度（系统归属 / 交易类型 / 切入类型 / 聚合规则）的盈亏比和总盈亏趋势对比。

## 字段配置（可在线管理）

在「字段配置」页面可动态管理：

| 配置项 | 说明 |
|--------|------|
| tradingTypes | 交易类型枚举值，支持增删 |
| entryTypes | 交易切入类型枚举值，支持增删 |
| aggregateRules | 聚合规则（名称 + 包含的交易类型组合） |

配置存储于 R2 `trading-data/{datasetId}/field-config.json`。

## 数据格式

### 交易记录字段

| 字段 | 类型 | 示例 |
|------|------|------|
| 开单时间 | string (yyyymmdd) | 20250401 |
| 股票名称 | string | 贵州茅台 |
| 股票代码 | string | 600519 |
| 交易类型 | enum (可配置) | 齐飞水底 |
| 交易切入类型 | enum (可配置) | p2前 |
| 是否符合系统 | 是/否 | 是 |
| 有无大的失误 | 是/否/其他 | 否 |
| 盈亏% | number | 5.2 |
| 持仓时间 | number (天) | 3 |
| 后续盈亏空间 | number 或 N/A | 3.5 |
| 盘前是否 | 是/否 | 否 |
| 图片 | string[] | ["250401_01.jpg", ...] |

### 默认枚举值

**交易类型**: 齐飞水底、齐飞水底三等量、齐飞前多踩MA、风险释放平台转一致、双阳平台转一致、非系统、未知

**交易切入类型**: p2前、p34、p4后、未知

**聚合规则**: 齐飞水底总（齐飞水底+三等量+前多踩MA）、转一致（风险释放平台转一致+双阳平台转一致）

## 状态管理架构

三个独立的 Zustand Store：

| Store | 职责 |
|-------|------|
| `recordsStore` | records、cycleStats、customAnalysis、customMonthly、fieldConfig |
| `datasetStore` | datasets、currentDatasetId |
| `uiStore` | isLoading、isSaving、isInitialized、error、currentFileName |

跨 Store 协调通过 `useStoreSync` hook 实现（R2 加载/保存/防抖/数据集切换）。

## 部署到 Cloudflare

详细部署步骤请参考 [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)

```bash
wrangler deploy
npm run build
wrangler pages deploy dist --project-name=trading-review
```

## 环境变量

```env
VITE_API_BASE_URL=https://your-worker.workers.dev
VITE_R2_ACCESS_TOKEN=your-api-token
```

## 数据流

1. 数据通过手动录入、Excel 导入、图片 OCR、文本解析四种方式进入
2. `recordsStore` (Zustand) 存储并管理交易记录
3. `useAnalysisResult()` / `useMonthlyAnalysis()` 从 store 实时计算分析数据
4. 图表组件直接从 `recordsStore` / `useAnalysisResult` / `useMonthlyAnalysis` 读取数据
5. `useStoreSync` hook 防抖自动保存到 R2（1 秒 debounce）
6. 图片通过 Chrome File System Access API 存入本地目录，按开单时间年份分目录

## 许可证

MIT
