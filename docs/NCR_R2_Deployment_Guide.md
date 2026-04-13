# NCR + R2 部署指导书

## 1. 文档目标

本文档用于部署当前仓库中 **`NCR + R2`** 这轮实现，覆盖以下内容：

- Cloudflare `D1` 数据库准备
- Cloudflare `R2` 存储桶准备
- API Worker 部署
- 前端部署
- 部署后验收
- 已知限制与注意事项

> 本文档基于当前代码现状编写，重点是让现在这版代码可以稳定部署和验收。

## 2. 当前部署架构

### 2.1 后端

- 平台：Cloudflare Workers
- 数据库：Cloudflare `D1`
- 对象存储：Cloudflare `R2`

### 2.2 前端

- 平台：Vercel（推荐）
- 构建方式：Vite + React Monorepo Workspace

### 2.3 当前 NCR 存储分工

- `R2`：
  - `ncrs/{shipId}/{ncrId}.json`
  - `media/{shipId}/{base}.webp`
  - `media/{shipId}/{base}_medium.webp`
  - `media/{shipId}/{base}_thumb.webp`
  - `ncr-files/{shipId}/{ncrId}/{fileId}-{filename}`
  - `ncr-pdf/{shipId}/{ncrId}/latest.pdf`
- `D1`：
  - `ncr_index`
  - 用户、项目、船、权限等业务表

## 3. 部署前检查

在仓库根目录执行：

```bash
cd d:/Code/nbins
pnpm install
pnpm typecheck
pnpm build
```

预期：

- 所有命令退出码为 `0`

## 4. Cloudflare 准备

## 4.1 登录 Wrangler

```bash
cd packages/api
pnpm exec wrangler login
```

## 4.2 创建 D1 数据库

建议为生产和测试环境分别创建数据库，例如：

```bash
pnpm exec wrangler d1 create nbins-prod
```

执行完成后会返回：

- `database_name`
- `database_id`

请记录 `database_id`。

## 4.3 创建 R2 存储桶

当前代码默认绑定的桶名是：

```text
nbins-assets
```

创建命令示例：

```bash
pnpm exec wrangler r2 bucket create nbins-assets
```

如果你希望生产环境使用其他桶名，例如 `nbins-assets-prod`，则需要同步修改：

- `packages/api/wrangler.jsonc` 中的 `bucket_name`

## 4.4 更新 `wrangler.jsonc`

编辑 `packages/api/wrangler.jsonc`，至少确认以下内容：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nbins-prod",
      "database_id": "<你的真实 D1 database_id>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "nbins-assets"
    }
  ],
  "vars": {
    "APP_ENV": "production",
    "APP_NAME": "NBINS",
    "SQL_CONSOLE_SECRET": "<建议改为你自己的值>"
  }
}
```

### 说明

- 当前仓库里的 `wrangler.jsonc` 仍偏向本地开发值，正式部署前应改成生产值
- `SQL_CONSOLE_SECRET` 不建议继续使用仓库中的默认字面值

## 5. 远程数据库初始化

### 5.1 生成最新 bootstrap SQL

回到仓库根目录：

```bash
cd d:/Code/nbins
pnpm d1:gen
```

### 5.2 执行远程建表

```bash
cd packages/api
pnpm exec wrangler d1 execute nbins-prod --remote --file src/db/d1-bootstrap.sql
```

### 5.3 验证 `ncr_index`

建议执行：

```bash
pnpm exec wrangler d1 execute nbins-prod --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='ncr_index';"
```

预期：

- 返回 `ncr_index`

## 6. 初始化管理员与基础数据

如果目标库还是空库，请先按现有项目方式写入管理员和基础数据。

### 6.1 初始化管理员

可复用现有 `docs/deployment-guide.md` 中的管理员初始化做法，或自行通过 SQL 插入一名 `admin` 用户。

### 6.2 检查项目 / 船数据

由于 `NCR` 依赖：

- `projects`
- `ships`
- `project_members`
- `users`

因此如果生产库里没有这些数据，虽然接口能启动，但 `NCR` 页面不会有可用项目和船。

## 7. 配置 Worker Secrets

在 `packages/api` 目录执行：

```bash
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put N8N_WEBHOOK_URL
```

说明：

- `JWT_SECRET`：生产环境必填
- `N8N_WEBHOOK_URL`：可选，如果需要审批通过后触发 webhook 再设置

## 8. 部署 API Worker

```bash
cd packages/api
pnpm exec wrangler deploy
```

### 预期结果

部署成功后会得到一个 Worker 地址，例如：

```text
https://nbins-api.<subdomain>.workers.dev
```

请记录该地址。

## 9. 部署前端

推荐部署到 Vercel。

### 9.1 Vercel 项目配置建议

- `Framework Preset`: `Vite`
- `Root Directory`: `packages/web`
- `Install Command`: `pnpm install`
- `Build Command`: `cd ../.. && pnpm install && pnpm build`
- `Output Directory`: `dist`

### 9.2 设置环境变量

在 Vercel 中添加：

- `VITE_NBINS_API_BASE_URL=https://nbins-api.<subdomain>.workers.dev/api`

> 如果你填写的是不带 `/api` 的根地址，前端代码也会自动补 `/api`，但建议直接填完整值，减少歧义。

### 9.3 触发部署

- 手动点击 `Deploy`
- 或提交代码到对应分支触发自动部署

## 10. CORS 配置

部署前请确认 `packages/api/src/index.ts` 中的 `cors.origin` 包含你的前端正式域名。

如果前端使用新的 Vercel 域名或自定义域名，而 API 端没有把它加入白名单，登录和上传会直接失败。

部署后若发现跨域错误，请：

1. 把新域名加入 `cors.origin`
2. 重新执行 `wrangler deploy`

## 11. 部署后验收步骤

## 11.1 API 基础检查

```bash
curl https://<your-worker>/health
curl https://<your-worker>/api/meta
```

### 预期重点

- `/health` 返回 `ok: true`
- `/api/meta` 返回：
  - `storageMode: "d1+r2"`
  - 包含 `/api/ncrs/:id/files`
  - 包含 `/api/ncrs/:id/pdf`
  - 包含 `/api/media/upload`

## 11.2 登录检查

使用前端页面登录，确认：

- 登录成功
- 无 CORS 错误
- 可加载项目和船

## 11.3 NCR 功能验收

至少完整走一遍下面流程：

1. 新建一条 `NCR`
2. 上传 1 张图片
3. 上传 1 个相关文件
4. 修改 `remark`
5. 生成 `PDF`
6. 下载 `PDF`
7. 审批通过
8. 刷新页面并再次验证

### 预期

- 页面功能正常
- `R2` 对象存在
- `D1 ncr_index` 数据同步

## 11.4 R2 对象核查

建议使用 Cloudflare Dashboard 或 Wrangler 查看对象是否落桶：

- `ncrs/...`
- `media/...`
- `ncr-files/...`
- `ncr-pdf/...`

如果使用命令行，可参考 `wrangler r2 object` 相关命令自行检查。

## 12. 回滚与风险说明

## 12.1 当前仍保留旧 `ncrs` 表

尽管当前 `NCR` 主数据已经切到 `R2 JSON + ncr_index`，但 `D1` 中的旧 `ncrs` 表仍存在，主要用于兼容和过渡。

这意味着：

- 不能再把旧 `ncrs` 表当作唯一真实来源
- SQL Console 的导入导出如果只处理 `D1 ncrs`，并不能完整恢复 `R2` 中的 `NCR` 数据

## 12.2 SQL Console 现已支持 `NCR + R2` 备份恢复

当前 SQL Console 的全库 / 单项目导入导出已同时覆盖：

- `D1` 中的业务表与 `ncr_index`
- `R2` 中的 `ncrs/`、`media/`、`ncr-files/`、`ncr-pdf/` 对象

但仍需注意：

- 数据量越大，导出的 JSON 会越大
- 导入导出耗时会明显增加
- 更适合作为管理工具和迁移工具，不建议高频执行

## 12.3 图片能力当前说明

当前生产实现为：

- 前端压缩并生成 `WebP` 图片变体后上传
- `R2` 中会写入 `original / medium / thumb` 三种对象
- 画廊默认优先读取 `thumb` 预览，点击再打开原图

如果后续需要更强的服务端图片处理链路，可以再单独排期增强；但当前版本已经具备计划所需的多规格图片回显能力。

## 13. 常见问题

### 13.1 `R2 bucket binding not configured`

原因：

- `wrangler.jsonc` 中未配置 `r2_buckets`
- 或部署环境未正确读取当前配置

解决：

- 检查 `binding = "BUCKET"`
- 检查 `bucket_name`
- 重新部署 Worker

### 13.2 `NCR not found`，但列表里有数据

优先排查：

- 对应 `ncr_index` 存在，但 `R2 ncrs/{shipId}/{ncrId}.json` 已丢失
- 或部署时切到了错误的桶 / 错误的环境数据库

### 13.3 文件上传成功但刷新后不见

优先检查：

- 是否成功写入 `R2`
- 是否成功写回 `NCR JSON`
- 是否成功同步 `ncr_index.fileCount`

### 13.4 PDF 下载成功但内容中文异常

当前 `PDF` 生成器是简化版基础字体输出，中文可能显示为 `?`。这是当前实现限制，不代表部署失败。

## 14. 建议的正式上线前最小清单

上线前建议至少确认：

- `wrangler.jsonc` 已切换到生产数据库和生产桶
- `JWT_SECRET` 已设置
- `SQL_CONSOLE_SECRET` 已改成私有值
- 前端正式域名已加入 CORS 白名单
- 用真实权限账号走完一次 `NCR` 全链路验收
- 已确认谁负责 `R2` 备份策略

## 15. 当前结论

截至当前代码状态：

- **核心 `NCR + R2` 功能可以部署并使用**
- 但还不能简单理解为“最初计划中的所有细节都已 100% 完成”
- 更准确地说，当前已经达到：
  - **主流程可用**
  - **页面可验收**
  - **可以部署到实际环境**
  - **仍存在若干增强项待后续迭代**
