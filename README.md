# NBINS — 新造船检验管理系统

> **New Building Inspection System** · 基于 Cloudflare Workers + D1 + R2 构建的船舶新造检验协作平台

---

## 功能概览

| 模块 | 说明 |
| :--- | :--- |
| **检验管理** | 报验项目管理、多轮检验工作流（AA / QCC / OWC / RJ / CX）、意见追踪与关闭 |
| **NCR 管理** | 不符合项报告（NCR）全生命周期：创建、审批、整改、关闭，含图片附件与 PDF 导出 |
| **FAT 管理** | 工厂验收测试记录，支持意见追踪与多图上传 |
| **巡检意见** | 巡检/试航意见记录，支持高亮标记与 Excel 导出 |
| **项目 & 船舶** | 多项目多船管理，里程碑节点追踪（钢板切割 / 安放龙骨 / 下水 / 试航 / 交船） |
| **用户管理** | 基于角色的权限控制（Admin / Manager / Reviewer / Inspector），多专业方向授权 |
| **检验报告** | 基于 jsPDF + html2canvas 生成高保真 PDF 报告 |
| **SQL 控制台** | 内置受密码保护的远程 SQL 查询界面（仅限调试） |

---

## 技术栈

### 后端 (`packages/api`)

- **运行时**：Cloudflare Workers（基于 [Hono](https://hono.dev/) 框架）
- **数据库**：Cloudflare D1（SQLite）
- **对象存储**：Cloudflare R2（NCR 数据 JSON + 图片附件）
- **认证**：JWT（`jose` 库），PBKDF2-SHA256 密码哈希（90,000 次迭代）

### 前端 (`packages/web`)

- **框架**：React 18 + React Router v7
- **构建**：Vite 5
- **图表**：Recharts
- **PDF**：jsPDF + html2canvas
- **Excel**：ExcelJS

### 共享类型 (`packages/shared`)

前后端共享 TypeScript 类型定义、常量与业务枚举。

---

## 仓库结构

```text
nbins/
├── packages/
│   ├── api/           # Hono API (Cloudflare Workers)
│   │   └── src/
│   │       ├── auth/          # JWT 签发 & 密码哈希
│   │       ├── db/            # D1 Schema & bootstrap SQL
│   │       ├── domain/        # 检验状态机领域规则
│   │       ├── persistence/   # R2 存储操作
│   │       ├── repositories/  # D1 数据仓库
│   │       ├── routes/        # Hono 路由（auth, users, projects, ships, inspections, ncrs, fats…）
│   │       └── services/      # 业务服务层
│   ├── shared/        # 前后端共享类型与常量
│   └── web/           # React 前端
│       └── src/
│           ├── pages/         # 各功能页面
│           ├── components/    # 通用组件
│           └── utils/         # PDF / Excel 导出工具
├── docs/              # 补充文档
├── n8n/               # n8n 工作流备份
├── DEPLOY.md          # 部署操作手册
└── pnpm-workspace.yaml
```

---

## 快速启动（本地开发）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 初始化本地 D1 数据库（首次运行）

```bash
pnpm d1:bootstrap
```

会自动执行建表 SQL 并写入种子数据（2个项目、4条船、若干默认用户）。

### 3. 启动 API

```bash
pnpm dev:api:d1
```

API 运行于 `http://127.0.0.1:8787`

### 4. 启动前端

```bash
pnpm dev:web
```

前端运行于 `http://127.0.0.1:5173`

---

## 默认账号

所有账号的初始密码均为 `1234`：

| 角色 | 账号 | 权限说明 |
| :--- | :--- | :--- |
| **超级管理员** | `admin1`, `admin2` | 全系统管理权限 |
| **项目经理** | `manager1`, `manager2` | 所属项目的查看与管理 |
| **审图专员** | `reviewer1`, `reviewer2` | 所属项目的审核角色 |
| **现场检验员** | `inspector1`, `inspector2` | 所属项目，HULL & PAINT 专业 |

> 用户可在**登录页**自行修改密码，无需管理员介入。

---

## 检验结果业务规则

| 结果 | 含义 | 后续行为 |
| :--- | :--- | :--- |
| `AA` | 接受 | 不允许新增意见；所有意见关闭后才最终 `closed` |
| `QCC` | 带意见接受（质检复核） | 允许新增意见；不触发新一轮检验 |
| `OWC` | 复检 | 允许新增意见；等待下一轮报验 |
| `RJ` | 拒绝 | 同 OWC，等待整改后重新报验 |
| `CX` | 取消 | 直接转为 `cancelled` |

---

## 常用命令

```bash
# 开发
pnpm dev:web           # 启动前端
pnpm dev:api:d1        # 启动 API（本地 D1 模式）

# 构建 & 检查
pnpm build             # 构建全部包
pnpm typecheck         # 全量类型检查

# 测试
pnpm --filter @nbins/api test

# 部署
pnpm deploy:api        # 部署 API 到 Cloudflare Workers
pnpm deploy:web        # 构建前端并部署到 Cloudflare Pages
pnpm deploy:all        # 一键部署 API + 前端

# 数据库（远程）
npx wrangler d1 execute nbins-prod --remote --file=packages/api/src/db/d1-bootstrap.sql
```

---

## 部署

详细部署说明请参阅 [DEPLOY.md](./DEPLOY.md)。

### 关键配置（`packages/api/wrangler.jsonc`）

- `d1_databases[0].database_id`：Cloudflare D1 数据库 ID
- `r2_buckets[0].bucket_name`：R2 存储桶名称（默认 `nbins-assets`）
- `vars.SQL_CONSOLE_SECRET`：SQL 控制台访问密码

### 生产环境必须设置的 Secrets

```bash
npx wrangler secret put JWT_SECRET     # JWT 签名密钥（生产环境必须）
npx wrangler secret put APP_ENV        # 设置为 production
```
