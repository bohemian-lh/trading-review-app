# Cloudflare Pages Configuration
微信公众号：Web技术学堂

## 项目部署步骤

### 1. 准备环境

确保已安装以下工具：
- Node.js >= 18.0.0
- Wrangler CLI (`npm install -g wrangler`)

### 2. 配置 Cloudflare

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 创建 R2 Bucket：
   - 进入 R2 Object Storage
   - 创建名为 `trading-review-data` 的存储桶
3. 获取 API Token：
   - 进入 API Tokens
   - 创建自定义 Token，权限：
     - `Account R2 Storage: Edit`
     - `Worker Scripts: Edit`

### 3. 配置环境变量

创建 `.dev.vars` 文件：
```bash
VITE_API_BASE_URL=https://your-worker.your-subdomain.workers.dev
VITE_R2_ACCESS_TOKEN=your-api-token
```

### 4. 部署 Worker

```bash
# 登录 Cloudflare
wrangler login

# 部署 Worker
wrangler deploy

# 获取 Worker URL
wrangler whoami
```

### 5. 部署前端

```bash
# 安装依赖
npm install

# 构建生产版本
npm run build

# 使用 Wrangler 部署
wrangler pages deploy dist --project-name=trading-review
```

### 6. 配置 Cloudflare Pages

1. 进入 Cloudflare Pages
2. 连接 Git 仓库（或手动上传）
3. 配置构建命令：`npm run build`
4. 配置输出目录：`dist`
5. 设置环境变量

### 7. 更新前端 API 地址

在 `.env.production` 中设置：
```bash
VITE_API_BASE_URL=https://trading-review-r2-proxy.your-account.workers.dev
```

### 8. 验证部署

1. 访问 Cloudflare Pages 提供的 URL
2. 测试 Excel 文件导入/导出
3. 验证 R2 存储功能

## 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_API_BASE_URL | Cloudflare Worker API 地址 | https://api.example.workers.dev |
| VITE_R2_ACCESS_TOKEN | R2 访问令牌 | (从 Cloudflare 获取) |

## 本地开发

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 功能测试

1. 导入 Excel 文件测试
2. 数据编辑功能测试
3. 图表可视化测试
4. 数据导出测试
5. R2 存储同步测试

## 注意事项

- 确保 R2 Bucket 权限配置正确
- Worker API Token 需要定期更新
- 大文件上传可能需要调整 Worker 超时设置
- 建议启用 Cloudflare Cache 优化性能
