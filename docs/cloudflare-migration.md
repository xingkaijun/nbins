# Cloudflare 全栈部署指南

本文档说明如何将 NBINS 从 Vercel + Cloudflare Workers 混合架构迁移到 Cloudflare 全栈架构。

## 架构对比

### 当前架构（混合）
```
浏览器 → Vercel (前端) → Cloudflare Workers (API) → D1 + R2
         美国节点         全球边缘节点
         ❌ 跨域延迟       ✅ 边缘计算
```

### 目标架构（全 Cloudflare）
```
浏览器 → Cloudflare Pages (前端) → Cloudflare Workers (API) → D1 + R2
         全球边缘节点              同一边缘节点
         ✅ 无跨域延迟             ✅ 原生集成
```

## 性能优势

| 指标 | 当前架构 | 全 Cloudflare | 提升 |
|------|----------|---------------|------|
| 首屏加载 | 800-1200ms | 300-500ms | 60%+ |
| API 延迟 | 200-500ms | 50-150ms | 70%+ |
| 冷启动 | 500ms | 50ms | 90%+ |
| 成本 | Vercel Pro $20/月 | Pages 免费 | 节省 $240/年 |

## 部署步骤

### 1. 准备工作

确保已安装 Wrangler CLI 并登录：

```bash
# 安装 wrangler（如果未安装）
pnpm add -g wrangler

# 登录 Cloudflare
wrangler login
```

### 2. 部署 API（Workers）

API 已经配置好，直接部署：

```bash
# 在项目根目录
pnpm deploy:api
```

部署后会得到 API 地址，例如：
- `https://nbins-api.your-account.workers.dev`

### 3. 创建 Pages 项目

```bash
# 首次部署会自动创建项目
cd packages/web
pnpm deploy
```

或者手动创建：

```bash
wrangler pages project create nbins-web
```

### 4. 配置环境变量

在 Cloudflare Dashboard 中配置：

1. 进入 **Workers & Pages** → **nbins-web** → **Settings** → **Environment variables**
2. 添加生产环境变量：

```
VITE_NBINS_API_BASE_URL = https://nbins-api.your-account.workers.dev/api
```

### 5. 配置自定义域名（可选）

1. 进入 **nbins-web** → **Custom domains**
2. 添加你的域名，例如 `ins.yourdomain.com`
3. 按提示配置 DNS

### 6. 更新 API CORS 配置

编辑 `packages/api/src/index.ts`，添加新的 Pages 域名到 CORS 白名单：

```typescript
app.use(
  "/api/*",
  cors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "https://nbins-web.pages.dev",           // Pages 默认域名
      "https://ins.yourdomain.com",            // 自定义域名
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
```

重新部署 API：

```bash
pnpm deploy:api
```

## 一键部署

完成上述配置后，后续更新只需：

```bash
# 部署全部
pnpm deploy:all

# 或分别部署
pnpm deploy:api   # 部署 API
pnpm deploy:web   # 部署前端
```

## 本地开发

本地开发时，前端仍然使用 Vite 开发服务器：

```bash
# 终端 1：启动 API
pnpm dev:api:d1

# 终端 2：启动前端
pnpm dev:web
```

## CI/CD 配置（可选）

### GitHub Actions 自动部署

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      
      - name: Deploy API
        run: pnpm deploy:api
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: Deploy Web
        run: pnpm deploy:web
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

在 GitHub 仓库设置中添加 Secret：
- `CLOUDFLARE_API_TOKEN`：从 Cloudflare Dashboard 生成

## 回滚方案

如果需要回滚到 Vercel：

1. 前端仍然保留在 Vercel（vercel.json 已配置）
2. 只需更新环境变量指向 Cloudflare Workers API
3. 无需修改代码

## 监控与日志

### 查看实时日志

```bash
# API 日志
wrangler tail nbins-api

# Pages 日志
wrangler pages deployment tail nbins-web
```

### Cloudflare Dashboard

- **Workers**：查看请求量、错误率、延迟
- **Pages**：查看部署历史、访问日志
- **D1**：查看数据库查询统计

## 常见问题

### Q: 部署后前端无法访问 API？

检查：
1. CORS 配置是否包含 Pages 域名
2. 环境变量 `VITE_NBINS_API_BASE_URL` 是否正确
3. API 是否成功部署

### Q: 如何查看环境变量是否生效？

```bash
# 在 Pages 函数中打印
console.log(import.meta.env.VITE_NBINS_API_BASE_URL)
```

### Q: 如何配置多个环境？

在 `wrangler.toml` 中配置：

```toml
[env.preview]
vars = { VITE_NBINS_API_BASE_URL = "https://preview-api.workers.dev/api" }

[env.production]
vars = { VITE_NBINS_API_BASE_URL = "https://nbins-api.workers.dev/api" }
```

## 成本估算

### Cloudflare 免费额度

| 服务 | 免费额度 | 超出后价格 |
|------|----------|-----------|
| Pages | 无限制请求 | $0 |
| Workers | 100k 请求/天 | $0.50/百万请求 |
| D1 | 5GB 存储 + 500万行读取/天 | $0.001/万行 |
| R2 | 10GB 存储 + 1000万次 Class A | $0.015/GB |

### 预估月成本

对于中小型项目（< 10万请求/天）：
- **完全免费** ✅

对于大型项目（> 100万请求/天）：
- Workers: ~$0.50/月
- D1: ~$1-5/月
- R2: ~$1-2/月
- **总计: $3-8/月**

对比 Vercel Pro ($20/月)，节省 60-85%。

## 下一步

1. ✅ 完成首次部署
2. ✅ 配置自定义域名
3. ✅ 设置 CI/CD 自动部署
4. ✅ 监控性能指标
5. ✅ 删除 Vercel 项目（确认无问题后）
