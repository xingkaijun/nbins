# NBINS 生产部署指南

> 本文档覆盖 NBINS 系统从零到上线的完整部署流程。
> 后端部署到 **Cloudflare Workers + D1**，前端部署到 **Vercel**。

---

## 目录

1. [前置准备](#一前置准备)
2. [第一步：Cloudflare D1 建库](#二第一步cloudflare-d1-建库)
3. [第二步：后端 Worker 部署](#三第二步后端-worker-部署)
4. [第三步：前端 Vercel 部署](#四第三步前端-vercel-部署)
5. [第四步：CORS 跨域联调](#五第四步cors-跨域联调)
6. [环境变量总览](#六环境变量总览)
7. [部署后验证](#七部署后验证)
8. [故障排查](#八故障排查)

---

## 一、前置准备

### 1.1 账号与工具

| 项目 | 要求 |
| :--- | :--- |
| **Cloudflare 账号** | 免费计划即可（Workers 免费额度：100k 请求/天，D1 免费额度：5GB） |
| **Vercel 账号** | Hobby 计划即可（关联 GitHub 仓库） |
| **Node.js** | ≥ 18.x（推荐 20.x+） |
| **pnpm** | ≥ 9.x（项目 `packageManager` 指定为 `pnpm@10.8.1`） |
| **wrangler CLI** | 项目内已安装（`devDependencies`），无需全局安装 |

### 1.2 登录 Cloudflare CLI

```bash
# 在项目根目录执行（使用项目内的 wrangler）
cd packages/api
pnpm exec wrangler login
```

会打开浏览器完成 OAuth 授权，成功后终端会显示 `Successfully logged in`。

### 1.3 确认项目能正常构建

```bash
# 在项目根目录
pnpm install
pnpm typecheck
pnpm build
```

如果有类型错误需要先解决，否则部署会失败。

---

## 二、第一步：Cloudflare D1 建库

### 2.1 创建生产数据库

```bash
cd packages/api
pnpm exec wrangler d1 create nbins-prod
```

命令执行后会输出类似：

```
✅ Successfully created DB 'nbins-prod' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "nbins-prod"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> **⚠️ 记下 `database_id`，后面需要填入配置文件。**

### 2.2 更新 wrangler.jsonc

将输出的 `database_id` 填入 `packages/api/wrangler.jsonc`：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "nbins-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-03",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nbins-prod",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← 替换为你的真实 ID
    }
  ],
  "vars": {
    "APP_ENV": "production",
    "APP_NAME": "NBINS"
  }
}
```

### 2.3 初始化表结构

先确保 `d1-bootstrap.sql` 是最新的：

```bash
# 回到项目根目录
cd ../..
pnpm d1:gen
```

然后在远程 D1 数据库中执行建表：

```bash
cd packages/api
pnpm exec wrangler d1 execute nbins-prod --remote --file src/db/d1-bootstrap.sql
```

成功后会输出 9 条 `success: true`（对应 9 张表）。

### 2.4 插入初始管理员

创建一个 `scripts/init-admin.sql` 文件，内容如下：

```sql
INSERT OR IGNORE INTO users (id, username, displayName, passwordHash, role, disciplines, accessibleProjectIds, isActive, createdAt, updatedAt)
VALUES (
  'sys-admin',
  'admin',
  'System Admin',
  'pbkdf2_sha256$120000$162da04d72ee27260448eab610d9c5bc$97761007c6cd78f4aaac7f53c67a54fb1ded164b2c6a28e55f0088358677f13e',
  'admin',
  '[]',
  '[]',
  1,
  datetime('now'),
  datetime('now')
);
```

执行：

```bash
pnpm exec wrangler d1 execute nbins-prod --remote --file scripts/init-admin.sql
```

> 初始管理员密码为 `1234`，上线后应立即通过前端界面修改密码。

### 2.5 验证数据库

```bash
pnpm exec wrangler d1 execute nbins-prod --remote --command "SELECT id, username, role FROM users;"
```

应看到 `sys-admin | admin | admin` 这一行记录。

---

## 三、第二步：后端 Worker 部署

### 3.1 设置敏感环境变量（Secrets）

这些变量通过加密存储，**不会**出现在代码或配置文件中：

```bash
cd packages/api

# 【必填】JWT 签名密钥 — 建议 ≥ 32 字符的随机字符串
pnpm exec wrangler secret put JWT_SECRET
# 终端提示输入后粘贴你的密钥，例如：
# Ky8mN3xQ9vR2pL7wE5tJ4hF6gB0cA1dZ

# 【可选】n8n 自动化 Webhook 地址
pnpm exec wrangler secret put N8N_WEBHOOK_URL
# 如果暂时不用 n8n 可跳过此步
```

> **关于 JWT_SECRET**：在 `APP_ENV=production` 模式下，如果未设置此 Secret，登录接口会直接返回 500 错误。可以用以下命令生成随机密钥：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 3.2 部署 Worker

```bash
cd packages/api
pnpm exec wrangler deploy
```

部署成功后会输出：

```
Published nbins-api (x.xx sec)
  https://nbins-api.<你的子域名>.workers.dev
```

> **记下这个 URL**，前端配置需要用到。

### 3.3 验证 Worker 是否正常

```bash
# 健康检查
curl https://nbins-api.<你的子域名>.workers.dev/health

# 应返回：
# {"ok":true,"service":"nbins-api","timestamp":"..."}
```

```bash
# 测试登录
curl -X POST https://nbins-api.<你的子域名>.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}'

# 应返回：
# {"ok":true,"data":{"user":{...},"token":"eyJ..."}}
```

### 3.4 自定义域名（可选）

如果你希望 API 使用自定义域名（如 `api.nbins.example.com`）：

1. 在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Domains
2. 点击 **Add Custom Domain**
3. 输入域名（该域名必须已在 Cloudflare DNS 中托管）

---

## 四、第三步：前端 Vercel 部署

### 4.1 连接 GitHub 仓库

1. 登录 [vercel.com](https://vercel.com)
2. 点击 **Add New** → **Project**
3. 选择你的 `nbins` GitHub 仓库
4. 配置构建参数：

| 配置项 | 值 |
| :--- | :--- |
| **Framework Preset** | Vite |
| **Root Directory** | `packages/web` |
| **Build Command** | `cd ../.. && pnpm install && pnpm build` |
| **Output Directory** | `dist` |
| **Install Command** | `pnpm install` |

> **为什么 Build Command 要回到根目录？** 因为前端依赖 `@nbins/shared` 这个 workspace 包，必须从 monorepo 根目录构建才能正确解析。

### 4.2 设置环境变量

在 Vercel 项目的 **Settings → Environment Variables** 中添加：

#### Production 环境

| Name | Value |
| :--- | :--- |
| `VITE_NBINS_API_BASE_URL` | `https://nbins-api.<你的子域名>.workers.dev/api` |

#### Preview 环境（可选）

| Name | Value |
| :--- | :--- |
| `VITE_NBINS_API_BASE_URL` | 与 Production 相同（或指向 staging Worker） |

> **注意**：Vite 的环境变量必须以 `VITE_` 前缀开头才能被前端代码访问。

### 4.3 触发部署

设置完成后点击 **Deploy**，或者直接推送代码到 `main` 分支，Vercel 会自动触发构建。

部署成功后会获得 Vercel 分配的域名，例如：
- `nbins-web.vercel.app`
- 或你自定义的 `nbins.example.com`

### 4.4 自定义域名（可选）

在 Vercel 项目 **Settings → Domains** 中添加你的自定义域名，按照提示配置 DNS 记录即可。

---

## 五、第四步：CORS 跨域联调

> ⚠️ **这是最容易遗漏的一步！** 如果跳过，前端将无法正常调用后端 API。

### 5.1 更新后端 CORS 白名单

修改 `packages/api/src/index.ts` 中的 CORS 配置，加入你的 Vercel 生产域名：

```typescript
app.use(
  "/api/*",
  cors({
    origin: [
      // 本地开发
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      // ✅ 生产域名
      "https://nbins-web.vercel.app",       // Vercel 默认域名
      "https://nbins.example.com",           // 自定义域名（如有）
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
```

### 5.2 重新部署 Worker

```bash
cd packages/api
pnpm exec wrangler deploy
```

### 5.3 验证跨域

打开浏览器访问 Vercel 上的前端页面，尝试登录。如果浏览器控制台没有 CORS 错误且登录成功，说明联调完成。

---

## 六、环境变量总览

### 6.1 后端 Cloudflare Workers

| 变量名 | 设置方式 | 必填 | 值 |
| :--- | :--- | :---: | :--- |
| `APP_ENV` | `wrangler.jsonc` → `vars` | ✅ | `"production"` |
| `APP_NAME` | `wrangler.jsonc` → `vars` | ❌ | `"NBINS"` |
| `JWT_SECRET` | `wrangler secret put` | ✅ | 随机强密钥 |
| `N8N_WEBHOOK_URL` | `wrangler secret put` | ❌ | n8n Webhook 地址 |
| `DB` | `wrangler.jsonc` → `d1_databases` | ✅ | D1 数据库绑定 |

### 6.2 前端 Vercel

| 变量名 | 设置位置 | 必填 | 值 |
| :--- | :--- | :---: | :--- |
| `VITE_NBINS_API_BASE_URL` | Vercel Dashboard → Environment Variables | ✅ | Worker API 完整地址 |

---

## 七、部署后验证

### 快速检查清单

```bash
# 1. Worker 健康检查
curl https://nbins-api.<域名>.workers.dev/health

# 2. D1 数据库连通性（通过 API 间接验证）
curl https://nbins-api.<域名>.workers.dev/api/meta

# 3. 登录验证
curl -X POST https://nbins-api.<域名>.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}'

# 4. 前端页面加载
# 浏览器打开 https://nbins-web.vercel.app 或自定义域名
# 使用 admin / 1234 登录
```

### 验证要点

- [ ] `/health` 返回 `{"ok": true}`
- [ ] `/api/meta` 返回 `environment: "production"`，`storageMode: "d1"`
- [ ] 登录成功返回有效 JWT Token
- [ ] 前端页面正常加载，无 CORS 错误
- [ ] 登录后能看到空白的项目列表（因为生产库只有 admin，没有项目数据）
- [ ] `/api/dev/*` 路由返回 404（生产环境已禁用）

---

## 八、故障排查

### 8.1 "JWT_SECRET is required when APP_ENV=production"

**原因**：设置了 `APP_ENV=production` 但未配置 `JWT_SECRET`。

**解决**：
```bash
cd packages/api
pnpm exec wrangler secret put JWT_SECRET
# 输入你的密钥
```

### 8.2 前端 CORS 报错

**症状**：浏览器控制台显示 `Access to fetch has been blocked by CORS policy`。

**原因**：后端 CORS 白名单中没有你的 Vercel 域名。

**解决**：修改 `packages/api/src/index.ts` 中 `cors.origin` 数组，加入前端域名后重新 `wrangler deploy`。

### 8.3 D1 "no such table" 错误

**原因**：远程 D1 数据库未执行建表 SQL。

**解决**：
```bash
cd packages/api
pnpm exec wrangler d1 execute nbins-prod --remote --file src/db/d1-bootstrap.sql
```

### 8.4 Vercel 构建失败 "Cannot find module @nbins/shared"

**原因**：Vercel 构建时未从 monorepo 根目录安装依赖。

**解决**：确保 Build Command 设置为 `cd ../.. && pnpm install && pnpm build`，且 Root Directory 设置为 `packages/web`。

### 8.5 登录后提示 "Invalid username or password"

**原因**：远程 D1 数据库中没有初始管理员数据。

**解决**：执行 [2.4 插入初始管理员](#24-插入初始管理员) 中的 SQL 命令。

---

## 完整部署命令速查

```bash
# ===== 一次性初始化（首次部署执行） =====

# 1. 登录 Cloudflare
cd packages/api && pnpm exec wrangler login

# 2. 创建 D1 数据库
pnpm exec wrangler d1 create nbins-prod
# → 记下 database_id，填入 wrangler.jsonc

# 3. 初始化表结构
cd ../.. && pnpm d1:gen
cd packages/api && pnpm exec wrangler d1 execute nbins-prod --remote --file src/db/d1-bootstrap.sql

# 4. 插入初始管理员
pnpm exec wrangler d1 execute nbins-prod --remote --file scripts/init-admin.sql

# 5. 设置 Secrets
pnpm exec wrangler secret put JWT_SECRET

# 6. 部署 Worker
pnpm exec wrangler deploy

# ===== 日常更新 =====

# 代码更新后重新部署 Worker
cd packages/api && pnpm exec wrangler deploy

# 前端自动通过 GitHub push 触发 Vercel 部署
git push origin main
```
