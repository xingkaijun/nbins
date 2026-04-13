# NBINS 项目部署与环境安装说明

> `NCR + R2` 当前版本的专用文档已新增：
> - `docs/NCR_R2_Local_Test_Guide.md`
> - `docs/NCR_R2_Deployment_Guide.md`
>
> 本文件仍可作为通用环境安装说明，但若你要验收或部署当前的 `NCR + R2` 能力，请优先参考上述两份新文档。

本项目是一个基于 Cloudflare D1 数据库和 Monorepo 结构的船舶检验管理系统。

## 1. 环境依赖

在开始之前，请确保您的开发运行环境已安装以下工具：

- **Node.js**: 建议版本为 `v20.x` 或更高（支持 `fetch` 和最新的 ESM 特性）。
- **pnpm**: 本项目使用 pnpm 指定 Monorepo 依赖管理。安装命令：`npm install -g pnpm`。
- **Cloudflare Wrangler**: 用于管理 D1 数据库和 API 部署。本项目已通过 pnpm 依赖包含，无需全局安装，如需手动调用可执行 `npx wrangler`。

## 2. 快速开始（本地开发环境）

### 安装依赖
```bash
pnpm install
```

### 初始化数据库 (Local D1)
在首次运行前，需要初始化本地的 D1 数据库并灌入种子数据：
```bash
pnpm d1:bootstrap
```

### 启动 API 后端 (D1 模式)
```bash
pnpm dev:api:d1
```
API 将运行在 `http://127.0.0.1:8787`。

### 启动 Web 前端
```bash
pnpm dev:web
```
前端将运行在 `http://127.0.0.1:5173`。

## 3. 部署指南

### 部署 D1 数据库
```bash
# 创建 D1 数据库（如果尚未创建）
npx wrangler d1 create nbins-db

# 执行初始化 SQL 脚本到远程数据库
npx wrangler d1 d1 execute nbins-db --remote --file=packages/api/src/db/d1-bootstrap.sql
```

#### D1 数据库运维

**查看数据库内容**：
```bash
# 查看所有表名
npx wrangler d1 execute nbins-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# 查看某个表的 schema
npx wrangler d1 execute nbins-db --remote --command "PRAGMA table_info(users)"

# 查询表数据
npx wrangler d1 execute nbins-db --remote --command "SELECT * FROM users LIMIT 10"
```

**修改数据库 schema**：
```bash
# 如果 schema 有更新，重新生成 bootstrap SQL
pnpm d1:gen

# 执行新增的 SQL 到远程数据库
npx wrangler d1 execute nbins-db --remote --file=packages/api/src/db/d1-bootstrap.sql
```

**注意**：当前项目没有使用正式的 migration 系统，每次修改 schema 会**重新生成完整的 `d1-bootstrap.sql`**。远程数据库执行时：
- 已存在的表不会重复创建
- 新增的字段需要手动 `ALTER TABLE` 或重建数据库

### 部署 R2 存储桶

当前项目需要 R2 存储桶来保存 NCR 数据、图片附件、文件和 PDF：

```bash
# 创建 R2 存储桶（默认桶名：nbins-assets）
npx wrangler r2 bucket create nbins-assets

# 验证桶是否创建成功
npx wrangler r2 bucket list
```

**配置 wrangler.jsonc**：

确认 `packages/api/wrangler.jsonc` 中的 R2 绑定：
```jsonc
{
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "nbins-assets"
    }
  ]
}
```

**查看 R2 对象**：
```bash
# 列出桶内对象
npx wrangler r2 object list nbins-assets

# 下载某个对象（调试用）
npx wrangler r2 object get nbins-assets ncrs/ship-001/ncr-001.json
```

**完整的 NCR + R2 部署流程**请参考：`docs/NCR_R2_Deployment_Guide.md`

### 部署 API (Cloudflare Workers)
确保 `packages/api/wrangler.jsonc` 中的 `database_id` 已正确配置为您的远程数据库 ID，然后运行：
```bash
pnpm --filter @nbins/api deploy
```

### 部署前端 (Vite Cloudflare Pages/Vercel)
构建生产环境包：
```bash
pnpm --filter @nbins/web build
```

## 4. 核心流程说明
- **数据流**: 前端通过 `/api/*` 请求后端，后端根据环境变量 `D1_DRIVER=d1` 调用本地或远程的 D1 数据库。
- **种子数据**: 本地开发时，如果数据库为空，API 会自动根据 `packages/api/src/persistence/seed.ts` 生成初始数据。
