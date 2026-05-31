# 交易复盘应用 - 部署问题 Debug 记录

## 问题概述
应用部署到 Cloudflare Pages 后，API 端点始终返回 404 错误，无法访问 R2 数据存储。

---

## 诊断过程

### 问题 1：环境变量和构建产物位置
**症状**：部署后访问 API 端点 `/api/records` 和 `/api/files` 返回 404 Not Found

**诊断步骤**：
1. 首先检查 dist 目录，发现构建后的目录中缺少 functions 文件夹
2. 检查 vite.config.ts，确认没有将 functions 复制到 dist 的配置
3. 分析 wrangler.toml，配置中指定了 pages_build_output_dir = "dist"
4. 查看 package.json，发现 build 脚本只是 tsc && vite build，没有复制 functions

**根本原因**：
- Cloudflare Pages 需要 functions 文件夹在部署根目录（即 dist）中才能识别和部署 Functions
- 我们的构建过程没有将 functions 目录复制到 dist 中

---

### 问题 2：路由冲突和配置干扰
**症状**：修复构建问题后，API 仍然 404 或返回错误

**诊断步骤**：
1. 发现了旧的 _routes.json 文件，该文件会干扰 Pages Functions 的路由匹配
2. 发现 functions 目录中存在多个路由处理文件冲突：
   - functions/api/records.ts（旧文件）
   - functions/api/[[path]].ts（新的通配符文件）
3. 这些冲突导致路由混乱

**根本原因**：
- _routes.json 中的自定义路由配置优先于 Pages Functions
- 多个 Functions 文件会产生路由匹配冲突

---

### 问题 3：通配符路由的匹配问题
**症状**：使用通配符 [[path]] 路由仍然有问题

**诊断步骤**：
1. 测试发现 Cloudflare Pages Functions 的通配符路由匹配规则比较复杂
2. 不同版本的 wrangler 对通配符路由的处理有差异
3. 调试日志显示请求没有正确到达 Functions

**解决策略**：
- 放弃通配符路由，改用明确的文件结构：
  - functions/api/records.ts → 处理 /api/records
  - functions/api/files.ts → 处理 /api/files
  - functions/api/files/[[filename]].ts → 处理 /api/files/[filename]

---

## 已实施的修复方案

### 1. 修改构建脚本
在 package.json 中更新 build 脚本，确保复制 functions：
```json
"build": "tsc && vite build && cp -r functions dist/"
```

### 2. 清理冲突文件
删除了：
- public/_routes.json
- 旧的 functions/api/records.ts
- 旧的 functions/api/[[path]].ts

### 3. 创建明确的 Functions 结构
```
functions/
└── api/
    ├── records.ts            → /api/records
    ├── files.ts              → /api/files
    └── files/
        └── [[filename]].ts   → /api/files/[filename]
```

### 4. 添加完整的调试日志
在每个 Functions 文件中添加 console.log，便于在 Cloudflare Dashboard 的实时日志中查看请求处理过程。

---

### 问题 4：Functions 多导出冲突
**症状**：`GET /api/files` 返回 400 Bad Request
**诊断步骤**：
1. 分析发现 files.ts 中同时导出了 `onRequest`、`onRequestGet` 和 `onRequestDelete` 等多个函数
2. Cloudflare Pages Functions 会优先匹配特定方法的导出，如 `onRequestGet`
3. 当同时存在多个导出时，路由匹配会产生混乱

**解决策略**：
- 简化 functions/api/files.ts，只保留 `onRequest`，在该函数中处理所有方法

---

## 当前部署状态

- 最新部署地址：https://2b2813b4.trading-review-app.pages.dev
- Functions 已正确部署
- R2 绑定配置：R2_BUCKET → trading-review-data
- 环境变量：API_TOKEN 已配置
- ✅ 连接测试成功！

---

## 已验证的环节
1. ✅ 访问最新部署地址（不是旧的 020baa2f）
2. ✅ /api/records 工作正常
3. ✅ 数据持久化到 R2 正常
4. ❓ /api/files - 已修复，待验证

---

## 最终综合原因（最终版）

完整的问题链路：
1. **构建过程中 functions 目录未被复制到 dist** - 最根本的部署问题
2. **_routes.json 和多个 Functions 文件造成路由冲突**
3. **通配符路由匹配的复杂性**
4. **Files.ts 中的多导出函数冲突** - 导致 /api/files 失败

---

### 问题 5：_redirects 路由配置干扰 API 请求
**症状**：即使修复了 Functions，API 仍然 404
**诊断步骤**：
1. 分析发现 public/_redirects 文件中有一条 catch-all 规则 `/* /index.html 200`
2. 该规则会匹配所有请求，包括 API 请求，导致它们被重定向到前端而不是 Functions
3. 修改 _redirects，添加 API 路径的优先级规则

**解决策略**：
更新 _redirects 文件：
```
# 优先让 API 请求通过，不重定向
/api/* /api/:splat 200
# 其他所有请求重定向到 index.html（SPA 路由）
/* /index.html 200
```

---

### 问题 6：全局 loading 状态导致组件卸载
**症状**：选择文件后，解析成功但 Modal 弹窗不显示
**诊断步骤**：
1. 添加详细调试日志，观察状态变化
2. 发现 Modal 组件始终收到 isOpen: false
3. 追踪发现 ExcelUploader 组件在调用 setIsModalOpen(true) 后立即被卸载
4. 最终定位到 App.tsx 中的逻辑：当 isLoading 为 true 时，整个应用会显示加载界面，导致组件卸载！

**解决策略**：
修改 App.tsx，让它只在初始化阶段（isInitialized 为 false）时才显示加载界面，之后忽略 isLoading 状态变化，避免组件被意外卸载。

---

## 完整修复历史

| 问题 | 修复方案 | 状态 |
|------|----------|------|
| 构建缺少 functions 目录 | 修改 build 脚本添加 cp 命令 | ✅ |
| _routes.json 干扰路由 | 删除该文件 | ✅ |
| Functions 文件冲突 | 简化为明确结构 | ✅ |
| files.ts 多导出冲突 | 简化为单个 onRequest | ✅ |
| _redirects 干扰 API | 添加 API 优先级规则 | ✅ |
| 全局 loading 卸载组件 | 修改 App.tsx 逻辑 | ✅ |

---

## 当前部署状态（2026-05-31）

- 最新部署地址：https://002929fc.trading-review-app.pages.dev
- ✅ 所有 API 端点正常工作
- ✅ 文件上传/下载功能正常
- ✅ Modal 弹窗正常显示
- ✅ 数据导入/导出功能完整

---

## 关键教训

1. **Cloudflare Pages Functions 需要正确的目录结构** - functions 目录必须在部署根目录
2. **_redirects 的路由优先级很重要** - API 路径需要明确的排除规则
3. **全局状态会影响组件生命周期** - loading 状态要谨慎处理，避免意外卸载组件
4. **调试日志是解决复杂问题的关键** - 在每个关键步骤添加日志能快速定位问题
