# NBINS 本地服务器部署手册

nbins 现在完全在自己的服务器上运行，不再依赖 Cloudflare（Workers / D1 / R2 都已移除）：

- **后端**：Node.js（>= 22.13）+ Hono（`@hono/node-server`），打包成单文件 `packages/api/dist/server.mjs`，默认只监听 `127.0.0.1:8787`
- **数据库**：Node 自带的 `node:sqlite`，单个 SQLite 文件，WAL 模式、`busy_timeout=5000`、外键约束开启；不需要编译原生模块
- **文件存储**：原来放在 R2 的 NCR/FAT 记录、照片、附件、PDF 现在存在本地目录（`storage/objects/<key>`，元数据在 `storage/meta/<key>.json`）
- **前端**：Vite 构建出的静态文件，由 nginx 托管在 `/nbins/` 下（也可以让 Node 进程自己托管，见第 8 节）
- **维护命令**：`dist/cli.mjs`（init / migrate / check / backup / import-d1 / import-objects）

下面以这样的目录布局为例，按需替换：

| 用途 | 路径 |
| :--- | :--- |
| 代码 | `/opt/nbins` |
| 配置文件（含密钥） | `/etc/nbins/nbins.env` |
| 数据库 + 文件 | `/var/lib/nbins`（`nbins.db`、`storage/`） |
| 备份 | `/var/backups/nbins` |
| 运行用户 | `nbins` |

> 在开发机上直接用 `pnpm` 跑时，配置文件是 `packages/api/.env`（已被 `.gitignore` 忽略，不会进 git），数据默认在 `packages/api/data/`。

---

## 1. 环境要求

- Node.js **22.13 或更高**（`node:sqlite` 需要；已在 Node 24 上验证）。Node 22.16 以下备份会走 `VACUUM INTO` 备选路径。
- pnpm 9（`corepack enable` 或 `npm install -g pnpm@9`）
- nginx
- `tar`（备份文件目录时用）

## 2. 安装与构建

```bash
sudo useradd --system --home /var/lib/nbins --shell /usr/sbin/nologin nbins
sudo mkdir -p /opt/nbins /etc/nbins /var/lib/nbins /var/backups/nbins /var/log/nbins
sudo chown nbins:nbins /var/lib/nbins /var/backups/nbins /var/log/nbins

# 代码放到 /opt/nbins（git clone 或拷贝），然后：
cd /opt/nbins
pnpm install --frozen-lockfile
pnpm build:nbins        # 后端打包 + 前端按 /nbins/ 子路径构建（API 地址 /nbins/api）
```

产物：

- `packages/api/dist/server.mjs`、`packages/api/dist/cli.mjs`：依赖已打包进去，运行时只需要 Node
- `packages/web/dist/`：前端静态文件

> 前端部署在站点根路径（不是 `/nbins/`）时用 `pnpm build`，并把下面 nginx 配置里的 `/nbins/` 改成 `/`。

## 3. 配置文件

以 `packages/api/.env.example` 为模板，写 `/etc/nbins/nbins.env`：

```ini
APP_ENV=production
APP_NAME=nbins
NBINS_HOST=127.0.0.1
NBINS_PORT=8787
NBINS_DB_PATH=/var/lib/nbins/nbins.db
NBINS_STORAGE_DIR=/var/lib/nbins/storage
NBINS_BACKUP_DIR=/var/backups/nbins
NBINS_AUTO_MIGRATE=true

# 登录令牌签名密钥，用 openssl rand -hex 32 生成。APP_ENV=production 时缺少它服务会拒绝启动。
JWT_SECRET=<openssl rand -hex 32 的输出>

# SQL 控制台口令。本项目部署按负责人的决定使用 pgnewbuilding。留空则控制台关闭。
SQL_CONSOLE_SECRET=pgnewbuilding

# 可选：新建 NCR 时调用的 n8n webhook
N8N_WEBHOOK_URL=
```

```bash
sudo chown root:nbins /etc/nbins/nbins.env
sudo chmod 640 /etc/nbins/nbins.env
```

要点：

- 服务和 CLI 都通过环境变量 `NBINS_ENV_FILE=/etc/nbins/nbins.env` 读这个文件；没设 `NBINS_ENV_FILE` 时读当前目录下的 `.env`。已经在环境里设置的变量优先于文件。
- 路径请写绝对路径（相对路径按进程的工作目录解析）。
- 全部变量和默认值见 `packages/api/.env.example` 和 `packages/api/src/config.ts` 顶部的表格。

### SQL 控制台

- 入口：管理员页面的 "SQL Console" 按钮，或直接打开 `/nbins/admin/sql`。
- 需要**同时**满足：已登录（请求带登录令牌），并输入正确的控制台口令（请求头 `X-SQL-Secret`）。口令错误返回 401 "Invalid SQL console secret"；没配置 `SQL_CONSOLE_SECRET` 时控制台返回 403。
- 本机开发环境的口令配置在 `packages/api/.env` 的 `SQL_CONSOLE_SECRET`；服务器上在 `/etc/nbins/nbins.env`。口令不写在源码里。

## 4. 初始化数据库

```bash
cd /opt/nbins/packages/api
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node dist/cli.mjs init
```

- 建表（迁移 `0001_baseline`），并在没有任何用户时写入初始账号（`admin1`、`admin2`、`manager1` …，初始密码都是 `1234`，**首次登录后请修改**）。
- `init --sample-data` 改为导入演示数据（`scripts/init-admin.sql` + `dummy-data*.sql`）。
- 要从 Cloudflare 迁移线上数据的话，**不要**先 init，直接看第 7 节。

检查：

```bash
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node dist/cli.mjs check
# integrity_check: ok / foreign_key_check: ok / journal_mode: wal / pending migrations: (none) + 各表行数
```

## 5. systemd 服务

`/etc/systemd/system/nbins.service`：

```ini
[Unit]
Description=nbins API server
After=network.target

[Service]
Type=simple
User=nbins
Group=nbins
WorkingDirectory=/opt/nbins/packages/api
Environment=NBINS_ENV_FILE=/etc/nbins/nbins.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/nbins/packages/api/dist/server.mjs
Restart=on-failure
RestartSec=3
# 配置错误（比如生产环境缺 JWT_SECRET）退出码是 78，不要反复重启
RestartPreventExitStatus=78
# 收到 SIGTERM 后会关闭 HTTP 服务和数据库再退出
KillSignal=SIGTERM
TimeoutStopSec=15

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/nbins /var/backups/nbins

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nbins
sudo systemctl status nbins
journalctl -u nbins -f          # 启动日志会打印 env 文件、数据库路径、文件目录和监听地址
curl http://127.0.0.1:8787/health
```

## 6. nginx

前端静态文件由 nginx 托管在 `/nbins/`，找不到的路径回退到 `index.html`（前端路由，例如 `/nbins/inspections/<id>` 在新标签页直接打开也能用）；`/nbins/api/` 反向代理到 `127.0.0.1:8787/api/`。

`/etc/nginx/conf.d/nbins.conf`（或放进已有 `server {}` 里）：

```nginx
server {
    listen 80;
    server_name nbins.example.local;      # 改成实际的主机名

    # NCR 附件上限 20 MB、照片 5 MB，留点余量
    client_max_body_size 25m;

    location = /nbins {
        return 301 /nbins/;
    }

    # API -> Node（只监听 127.0.0.1）
    location /nbins/api/ {
        proxy_pass http://127.0.0.1:8787/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;          # 全量导出 / PDF 可能较慢
    }

    location = /nbins/health {
        proxy_pass http://127.0.0.1:8787/health;
    }

    # 带 hash 的静态资源：长期缓存；不存在就 404（不要回退成 index.html）
    location /nbins/assets/ {
        alias /opt/nbins/packages/web/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 前端：单页应用回退到 index.html
    location /nbins/ {
        alias /opt/nbins/packages/web/dist/;
        try_files $uri $uri/ /nbins/index.html;
    }

    location = /nbins/index.html {
        alias /opt/nbins/packages/web/dist/index.html;
        add_header Cache-Control "no-cache";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

要 HTTPS 时在这个 `server {}` 上加证书（`listen 443 ssl;` + `ssl_certificate` …），其余不变。

## 7. 从 Cloudflare 迁移数据（D1 + R2）

> 不要用管理后台的「全量导出」（SQL 控制台的 export-db）来迁移：它不包含 FAT 数据（`fat_index` 表和 `fats/` 下的记录都不在里面）。请用下面的 D1 导出 + R2 下载。

**1）在有 Cloudflare 登录的机器上导出 D1：**

```bash
npx wrangler login
npx wrangler d1 export nbins-prod --remote --output=nbins-prod.sql
```

**2）下载 R2 桶 `nbins-assets` 的全部对象**，保持对象 key 作为相对路径（`ncrs/…`、`fats/…`、`media/…`、`ncr-files/…`、`ncr-pdf/…`）。wrangler 只能逐个下载对象，整桶下载可以用 R2 的 S3 兼容接口，例如 rclone：

```bash
# rclone 配置一个 type = s3, provider = Cloudflare 的远端（R2 API Token 的 Access Key / Secret，
# endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com），然后：
rclone copy r2:nbins-assets ./nbins-assets

# 单个对象也可以用 wrangler：
npx wrangler r2 object get nbins-assets/ncrs/<shipId>/<ncrId>.json --remote --file ./nbins-assets/ncrs/<shipId>/<ncrId>.json
```

**3）拷到服务器后导入：**

```bash
sudo systemctl stop nbins
cd /opt/nbins/packages/api
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env \
  node dist/cli.mjs import-d1 /path/to/nbins-prod.sql --objects /path/to/nbins-assets
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node dist/cli.mjs check
sudo systemctl start nbins
```

- `import-d1` 先导入到临时文件，删掉 D1 内部表（`_cf_KV`、`_cf_METADATA`、`d1_migrations`），补齐迁移，跑 `integrity_check` 和 `foreign_key_check`，打印各表行数；检查通过才替换正式库。检查不通过时临时库留在原地供排查，正式库不动。
- 目标库里已经有数据时会拒绝执行；确认要覆盖就加 `--force`（会先自动做一次数据库备份）。注意：加了 `--force` 时检查不通过也会替换，所以覆盖前先不加 `--force` 试一次。
- 文件也可以单独导入：`node dist/cli.mjs import-objects /path/to/nbins-assets`。
- 在开发机上可以用 `pnpm db:import-d1 -- /绝对路径/nbins-prod.sql --objects /绝对路径/nbins-assets`（读 `packages/api/.env`）。

## 8. 备份与恢复

手动备份：

```bash
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node /opt/nbins/packages/api/dist/cli.mjs backup
```

- 用 SQLite 在线备份（服务运行中也可以做），备份后跑 `integrity_check`，写成 `nbins-<时间>.db`
- 同时把文件目录打包成 `nbins-<时间>.files.tar.gz`（`--no-files` 跳过）
- 默认保留最近 14 份（`--keep N` 修改），`--out DIR` 指定目录

**每晚自动备份**，`/etc/cron.d/nbins`：

```cron
NBINS_ENV_FILE=/etc/nbins/nbins.env
# 每天 02:30 备份，保留 14 份
30 2 * * * nbins /usr/bin/node /opt/nbins/packages/api/dist/cli.mjs backup --keep 14 >> /var/log/nbins/backup.log 2>&1
```

备份目录最好再同步到另一台机器或外部存储。

**恢复：**

```bash
sudo systemctl stop nbins
sudo -u nbins rm -f /var/lib/nbins/nbins.db-wal /var/lib/nbins/nbins.db-shm
sudo -u nbins cp /var/backups/nbins/nbins-<时间>.db /var/lib/nbins/nbins.db
# 文件目录（压缩包里是 storage/ 目录）：
sudo -u nbins mv /var/lib/nbins/storage /var/lib/nbins/storage.old
sudo -u nbins tar -xzf /var/backups/nbins/nbins-<时间>.files.tar.gz -C /var/lib/nbins
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node /opt/nbins/packages/api/dist/cli.mjs check
sudo systemctl start nbins
```

## 9. 升级

```bash
cd /opt/nbins
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node packages/api/dist/cli.mjs backup   # 先备份
git pull                       # 或拷入新代码
pnpm install --frozen-lockfile
pnpm build:nbins
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node packages/api/dist/cli.mjs migrate  # 可选：服务启动时也会自动迁移
sudo systemctl restart nbins
curl http://127.0.0.1:8787/health
sudo -u nbins NBINS_ENV_FILE=/etc/nbins/nbins.env node packages/api/dist/cli.mjs check
```

- 迁移记录在 `schema_migrations` 表里，可以重复执行；启动时（`NBINS_AUTO_MIGRATE=true`）会自动补上缺的表、索引和可以安全添加的列，日志里会写出补了什么。
- 需要人工处理的列（比如 NOT NULL 且没有默认值）会在日志 / `migrate` 输出里以 `WARNING ... needs a manual fix` 列出。

## 10. 不用 nginx 时（只在内网临时用）

Node 进程也可以自己托管前端：在配置里加

```ini
NBINS_WEB_DIST=/opt/nbins/packages/web/dist
NBINS_WEB_BASE=/nbins/
```

然后访问 `http://127.0.0.1:8787/nbins/`。它同样提供单页回退和 `/nbins/api/*`。默认只监听 127.0.0.1；要让别的机器访问请放在 nginx 后面，而不是把 `NBINS_HOST` 改成 `0.0.0.0`。

## 11. 开发环境

```bash
pnpm install
pnpm db:init                    # 或 pnpm db:init -- --sample-data
pnpm dev                        # 同时起 API（127.0.0.1:8787，改代码自动重启）和前端（Vite，端口 5173，/api 代理到 8787）
```

其他命令：`pnpm typecheck`、`pnpm build`、`pnpm test:api`、`pnpm test:web`、`pnpm db:migrate`、`pnpm db:check`、`pnpm db:backup`。

真实端口的冒烟测试（需要 curl 和 jq，先 `pnpm build:nbins`）：

```bash
bash scripts/smoke-local.sh
```

它在临时目录里新建数据库，用 `packages/api/.env` 的配置在 127.0.0.1:8787 启动 `dist/server.mjs`，依次检查健康检查、登录、列表、详情、提交结果、照片上传、`/nbins/inspections/<id>` 单页回退、SQL 控制台（正确 / 错误口令）和重启后数据是否还在，最后停掉服务。
