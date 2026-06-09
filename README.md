# 交易复盘管理系统

注意：本项目绝大部分代码由AI生成。

基于 React + Cloudflare Pages/R2 的交易数据管理和可视化系统。

## 功能特性

- Excel 导入/导出：支持拖拽上传和本地文件选择
- 数据编辑：在线编辑、添加、删除交易记录
- 动态数据分析：自动计算盈亏比和平均持仓时间
- 月度趋势图表：基于 Recharts 的折线图可视化
- 周期统计图表：多维度周期盈亏比趋势对比
- 动态字段配置：交易类型、切入类型、聚合规则可在线增删
- 云端存储：集成 Cloudflare R2 对象存储
- 响应式设计：支持桌面和移动设备

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand
- **Excel处理**: SheetJS (xlsx)
- **图表库**: Recharts
- **路由**: React Router v6
- **校验**: Zod
- **测试**: Vitest
- **云服务**: Cloudflare Pages + R2 + Workers

## 项目结构

```
trading-review-app/
├── src/
│   ├── components/
│   │   ├── common/         # 通用UI组件 (Button, Input, Select, Modal等)
│   │   ├── config/         # 字段配置页面
│   │   ├── excel/          # Excel导入/导出组件
│   │   ├── editor/         # 数据编辑组件
│   │   └── charts/         # 图表组件
│   ├── hooks/              # 自定义 Hooks
│   ├── services/
│   │   ├── excelService.ts     # Excel解析与生成
│   │   ├── r2Service.ts        # R2存储 API 调用
│   │   └── cycleStatsService.ts # 周期统计计算
│   ├── stores/
│   │   └── dataStore.ts        # Zustand 状态管理
│   ├── types/                  # TypeScript 类型定义
│   │   ├── analysis.ts         # AnalysisResult、MonthlyAnalysis
│   │   ├── cycleStats.ts       # CycleStats、CycleStatType
│   │   ├── fieldConfig.ts      # FieldConfig、AggregateRule
│   │   ├── trading.ts          # TradingRecord、EntryType
│   │   └── validation.ts       # Zod Schema
│   ├── utils/                  # 工具函数
│   │   ├── calculations.ts     # 盈亏比计算
│   │   ├── validationUtils.ts  # 运行时校验
│   │   └── dateUtils.ts        # 日期处理
│   ├── App.tsx                 # 主应用组件（路由+导航）
│   ├── main.tsx                # 入口文件
│   └── index.css               # 全局样式
├── functions/
│   └── api/
│       ├── records.ts          # /api/records 端点
│       └── config.ts           # /api/config 端点
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── wrangler.toml               # Cloudflare配置
└── CLOUDFLARE_DEPLOY.md       # 部署指南
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发模式（推荐）

使用 Cloudflare Pages 本地开发环境，支持完整的 Functions 功能：

```bash
npm run dev:cf
```

访问 http://localhost:5173

### 纯 Vite 开发模式（API 不可用）

仅开发 UI 组件时使用，R2 API 功能不可用：

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

### 动态分析维度

#### 固定维度（8项）
- 符合系统 / 系统无失误 / 系统有失误 / 非系统 盈亏比
- 系统/非系统 盈利/亏损平均持仓天数

#### 动态维度（从 FieldConfig 驱动）
- **交易类型盈亏比**: tradingTypeRatios — Record<string, number>
- **交易切入类型盈亏比**: entryTypeRatios — Record<string, number>
- **聚合规则盈亏比**: aggregateRatios — Record<string, number>

### 月度数据分析

基于 `开单时间` 提取 `yyyymm` 格式的月数，自动按月聚合计算各项指标。

### 周期统计

每 30 条匹配记录为一个周期，支持多维度（系统归属 / 交易类型 / 切入类型 / 聚合规则）的盈亏比和总盈亏趋势对比。

## 字段配置（可在线管理）

在「字段配置」页面可动态管理：

| 配置项 | 说明 |
|--------|------|
| tradingTypes | 交易类型枚举值，支持增删，删除时自动将记录标记为「未知」 |
| entryTypes | 交易切入类型枚举值，同上 |
| aggregateRules | 聚合规则（名称 + 包含的交易类型组合） |

配置存储于 R2 `trading-data/field-config.json`，独立于交易数据。

## 数据格式

### 交易记录字段

| 字段 | 类型 | 示例 |
|------|------|------|
| 开单时间 | string (yyyymmdd) | 20240601 |
| 股票名称 | string | 沪深300ETF |
| 股票代码 | string | 510300 |
| 交易类型 | enum (可配置) | 齐飞水底 |
| 交易切入类型 | enum (可配置) | p2前 |
| 是否符合系统 | 是/否 | 是 |
| 有无大的失误 | 是/否/其他 | 否 |
| 盈亏情况 | number (%) | 5.2 |
| 持仓时间 | number (天) | 3 |
| 盘前是否 | 是/否 | 否 |

### 默认枚举值

**交易类型**: 齐飞水底、齐飞水底三等量、齐飞前多踩MA、风险释放平台转一致、双阳平台转一致、非系统、未知

**交易切入类型**: p2前、p34、p4后、未知

**聚合规则**: 齐飞水底总（齐飞水底+三等量+前多踩MA）、转一致（风险释放平台转一致+双阳平台转一致）

## 部署到 Cloudflare

详细部署步骤请参考 [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)

```bash
wrangler login
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

1. Excel 文件通过 `ExcelUploader` 组件导入
2. `excelService.parseExcelFile()` 解析数据
3. `dataStore` (Zustand) 存储并管理状态
4. `useAnalysisResult()` / `useMonthlyAnalysis()` 从 store 计算分析数据
5. 图表组件通过 `useMemo(fieldConfig)` 动态派生配置
6. 周期统计调用 `cycleStatsService.generateCycleStats()` 生成

## 许可证

MIT
