# @nbins/api

nbins 后端：Hono API，跑在 Node.js >= 22.13 上（`@hono/node-server`），数据在一个 SQLite 文件（`node:sqlite`，WAL）和一个本地文件目录里。

- 配置：复制 `.env.example` 为 `.env`（不进 git），或用 `NBINS_ENV_FILE` 指定文件。变量说明见 `.env.example` 和 `src/config.ts`。
- 开发：`pnpm dev`（`node --watch src/server.ts`）
- 构建：`pnpm build` → `dist/server.mjs`（服务）和 `dist/cli.mjs`（维护命令），依赖已打包
- 运行：`pnpm start`（`node dist/server.mjs`），默认监听 `127.0.0.1:8787`
- 维护：`pnpm db:init` / `db:migrate` / `db:check` / `db:backup` / `db:import-d1`，或 `node dist/cli.mjs <命令>`
- 测试：`pnpm test`（内存 SQLite 上跑真实建表脚本）

路由列表见 `GET /api/meta`。部署（nginx、systemd、备份、从 Cloudflare D1/R2 迁移）见仓库根目录的 `DEPLOY.md`。
