# NBINS — 新造船检验管理系统

> **New Building Inspection System** · 船舶新造检验协作平台，在自己的服务器上运行（Node.js + SQLite + 本地文件存储，不依赖 Cloudflare）

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
| **SQL 控制台** | 内置的 SQL 查询界面（需登录 + 控制台口令 `SQL_CONSOLE_SECRET`，仅限调试） |

---

## 技术栈

### 后端 (`packages/api`)

- **运行时**：Node.js >= 22.13（[Hono](https://hono.dev/) + `@hono/node-server`），打包为 `dist/server.mjs`，默认只监听 `127.0.0.1:8787`
- **数据库**：SQLite 单文件（Node 自带 `node:sqlite`，WAL 模式），带迁移记录表 `schema_migrations`
- **文件存储**：本地目录（NCR/FAT 记录 JSON、照片、附件、PDF）
- **认证**：JWT，PBKDF2-SHA256 密码哈希（90,000 次迭代）

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
│   ├── api/           # Hono API (Node.js)
│   │   ├── .env.example   # 配置模板（实际配置写在 packages/api/.env，不进 git）
│   │   └── src/
│   │       ├── server.ts      # Node 服务入口
│   │       ├── cli.ts         # 维护命令（init/migrate/check/backup/import-d1）
│   │       ├── config.ts      # 环境变量配置
│   │       ├── platform/      # SQLite 适配层 & 本地文件存储
│   │       ├── auth/          # JWT 签发 & 密码哈希
│   │       ├── db/            # Schema、迁移、bootstrap SQL
│   │       ├── domain/        # 检验状态机领域规则
│   │       ├── persistence/   # 数据存取
│   │       ├── repositories/  # 数据仓库
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
├── DEPLOY.md          # 本地服务器部署手册（nginx / systemd / 备份 / 数据迁移）
└── pnpm-workspace.yaml
```

---

## 快速启动（本地开发）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置

```bash
cp packages/api/.env.example packages/api/.env
```

按需填写 `JWT_SECRET`、`SQL_CONSOLE_SECRET` 等。`packages/api/.env` 已被 `.gitignore` 忽略。本机的 SQL 控制台口令按负责人决定设为 `pgnewbuilding`，就写在这个文件里，源码里不写口令；不设则控制台关闭。

### 3. 初始化数据库（首次运行）

```bash
pnpm db:init                    # 建表 + 初始账号；或 pnpm db:init -- --sample-data 导入演示数据
```

数据默认在 `packages/api/data/`（`nbins.db` + `storage/`）。

### 4. 启动

```bash
pnpm dev                        # 同时启动 API 和前端
```

API 运行于 `http://127.0.0.1:8787`，前端（Vite）在 5173 端口，`/api` 代理到 8787。也可以分别用 `pnpm dev:api`、`pnpm dev:web`。

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
pnpm dev               # API + 前端
pnpm dev:api           # 只起 API（127.0.0.1:8787，改代码自动重启）
pnpm dev:web           # 只起前端

# 构建 & 检查
pnpm build             # 构建全部包（前端部署在站点根路径）
pnpm build:nbins       # 构建，前端部署在 /nbins/ 子路径（API 地址 /nbins/api）
pnpm typecheck         # 全量类型检查

# 测试
pnpm test:api
pnpm test:web

# 生产运行（读 packages/api/.env，或 NBINS_ENV_FILE 指定的文件）
pnpm start             # node packages/api/dist/server.mjs

# 数据库与文件
pnpm db:init           # 建表 + 初始账号（-- --sample-data 导入演示数据）
pnpm db:migrate        # 补齐迁移 / 缺的列（服务启动时也会自动做）
pnpm db:check          # 完整性、外键、迁移状态、各表行数
pnpm db:backup         # 在线备份数据库 + 打包文件目录，默认保留最近 14 份
pnpm db:import-d1 -- /绝对路径/export.sql --objects /绝对路径/R2下载目录   # 从 Cloudflare D1/R2 迁移
```

---

## 部署

在本地服务器上部署（nginx 托管前端并反向代理 API、systemd 服务、每晚备份、从 Cloudflare 迁移数据、升级步骤）见 [DEPLOY.md](./DEPLOY.md)。

### 关键配置（`packages/api/.env`，服务器上可放 `/etc/nbins/nbins.env` 并用 `NBINS_ENV_FILE` 指定）

- `APP_ENV`：`production` 时必须设置 `JWT_SECRET`，否则拒绝启动
- `JWT_SECRET`：登录令牌签名密钥（`openssl rand -hex 32`）
- `SQL_CONSOLE_SECRET`：SQL 控制台口令（本项目部署使用 `pgnewbuilding`）；留空则控制台关闭
- `NBINS_HOST` / `NBINS_PORT`：默认 `127.0.0.1:8787`，对外由 nginx 提供
- `NBINS_DATA_DIR` 或 `NBINS_DB_PATH` / `NBINS_STORAGE_DIR` / `NBINS_BACKUP_DIR`：数据、文件、备份位置

完整列表见 `packages/api/.env.example`。
