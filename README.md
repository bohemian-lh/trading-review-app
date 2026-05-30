# 交易复盘管理系统

基于 React + Cloudflare Pages/R2 的交易数据管理和可视化系统。

## 功能特性

- ✅ Excel 导入/导出：支持拖拽上传和本地文件选择
- ✅ 数据编辑：在线编辑、添加、删除交易记录
- ✅ 动态数据分析：自动计算盈亏比和平均持仓时间
- ✅ 月度趋势图表：基于 Recharts 的折线图可视化
- ✅ 云端存储：集成 Cloudflare R2 对象存储
- ✅ 响应式设计：支持桌面和移动设备

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand
- **Excel处理**: SheetJS (xlsx)
- **图表库**: Recharts
- **路由**: React Router v6
- **云服务**: Cloudflare Pages + R2 + Workers

## 项目结构

```
trading-review-app/
├── src/
│   ├── components/
│   │   ├── common/        # 通用UI组件
│   │   ├── excel/         # Excel导入组件
│   │   ├── editor/        # 数据编辑组件
│   │   └── charts/        # 图表组件
│   ├── services/
│   │   ├── excelService.ts   # Excel解析服务
│   │   └── r2Service.ts       # R2存储服务
│   ├── stores/
│   │   └── dataStore.ts      # Zustand状态管理
│   ├── types/                 # TypeScript类型定义
│   ├── utils/                 # 工具函数
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # 入口文件
│   └── index.css              # 全局样式
├── workers/
│   └── r2-proxy/              # Cloudflare Worker
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── wrangler.toml              # Cloudflare配置
└── CLOUDFLARE_DEPLOY.md      # 部署指南
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 数据分析逻辑

### 盈亏比计算

- **如果 |盈总值| > |亏总值|** → 盈/亏 = 正值（盈利能力强）
- **如果 |盈总值| < |亏总值|** → 亏/盈 = 负值（亏损能力强）
- **四舍五入保留一位小数**

### 表2 - 动态数据分析

- 符合系统盈亏比
- 符合系统无失误盈亏比
- 符合系统有失误盈亏比
- 不符合系统盈亏比
- 符合系统盈利/亏损平均持仓时间
- 不符合系统盈利/亏损平均持仓时间

### 表3 - 月度数据分析

基于 `开单时间` 提取 `yyyymm` 格式的月数，自动按月聚合计算各项指标。

## 部署到 Cloudflare

详细部署步骤请参考 [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)

### 快速部署

```bash
# 1. 登录 Cloudflare
wrangler login

# 2. 部署 Worker
wrangler deploy

# 3. 构建并部署前端
npm run build
wrangler pages deploy dist --project-name=trading-review
```

## 环境变量

```env
VITE_API_BASE_URL=https://your-worker.workers.dev
VITE_R2_ACCESS_TOKEN=your-api-token
```

## 数据格式

### 表1 - 交易复盘数据

| 字段 | 类型 | 说明 |
|------|------|------|
| 开单时间 | string | yyyymmdd格式 |
| 股票名称 | string | - |
| 股票代码 | string | - |
| 交易类型 | enum | 齐飞水底/齐飞前多踩MA/风险释放平台转一致/双阳平台转一致 |
| 是否符合系统 | enum | 是/否 |
| 有无大的失误 | enum | 是/否 |
| 盈亏情况 | number | 百分比，正为盈负为亏 |
| 持仓时间 | number | 天数 |
| 盘前是否 | enum | 是/否 |

## 开发指南

### 添加新组件

1. 在 `src/components` 下创建组件文件
2. 使用 `@/` 路径别名导入相关模块
3. 组件使用 Tailwind CSS 样式

### 添加新页面

在 `App.tsx` 的 `Routes` 中添加新路由：

```tsx
<Route path="/new-page" element={<NewPage />} />
```

### 数据流

1. Excel 文件通过 `ExcelUploader` 组件导入
2. `excelService.parseExcelFile()` 解析数据
3. `dataStore` 存储并管理状态
4. 组件通过 `useDataStore` Hook 访问数据
5. 图表组件自动计算并展示数据

## 许可证

MIT
