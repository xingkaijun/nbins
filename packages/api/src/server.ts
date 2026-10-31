/**
 * nbins API server for a local / on-premises machine (Node >= 22.13).
 *
 *   pnpm dev     -> node --watch src/server.ts      (source, auto-reload)
 *   pnpm start   -> node dist/server.mjs            (bundled by `pnpm build`)
 *
 * Start-up: read .env (if present) -> config -> open SQLite (WAL) -> apply
 * pending migrations -> listen on NBINS_HOST:NBINS_PORT. SIGINT/SIGTERM close
 * the HTTP server and the database cleanly.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { ConfigError, loadConfig, loadEnvFileIfPresent } from "./config.ts";
import { migrate } from "./db/migrate.ts";
import type { Bindings } from "./env.ts";
import { FileSystemObjectStore } from "./platform/fs-object-store.ts";
import { LocalSqliteDatabase } from "./platform/sqlite-database.ts";
import { createServerApp } from "./server-app.ts";

function log(message: string): void {
  console.log(`[nbins] ${message}`);
}

function main(): void {
  const envFile = loadEnvFileIfPresent();
  const config = loadConfig();

  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.storageDir, { recursive: true });

  const db = new LocalSqliteDatabase(config.dbPath);

  if (config.autoMigrate) {
    const report = migrate(db);
    if (report.applied.length > 0) {
      log(`migrations applied: ${report.applied.join(", ")}`);
    }
    for (const fix of report.addedColumns) {
      log(`schema: added missing column ${fix.table}.${fix.column}`);
    }
    for (const fix of report.manualColumns) {
      log(`schema WARNING: column ${fix.table}.${fix.column} is missing and needs a manual fix: ${fix.sql}`);
    }
  }

  const bindings: Bindings = {
    APP_NAME: config.appName,
    APP_ENV: config.appEnv,
    DB: db,
    BUCKET: new FileSystemObjectStore(config.storageDir),
    JWT_SECRET: config.jwtSecret,
    N8N_WEBHOOK_URL: config.n8nWebhookUrl,
    SQL_CONSOLE_SECRET: config.sqlConsoleSecret,
    CORS_ORIGINS: config.corsOrigins
  };

  const app = createServerApp({ webDistDir: config.webDistDir, webBasePath: config.webBasePath });
  const server = serve({ fetch: (request) => app.fetch(request, bindings), hostname: config.host, port: config.port }, (info) => {
    log(`env file: ${envFile ?? "(none)"}`);
    log(`database: ${config.dbPath}`);
    log(`files:    ${config.storageDir}`);
    log(`web:      ${config.webDistDir ? `${config.webDistDir} at ${config.webBasePath}` : "(not served; use nginx or NBINS_WEB_DIST)"}`);
    log(`listening on http://${info.address.includes(":") ? `[${info.address}]` : info.address}:${info.port} (APP_ENV=${config.appEnv})`);
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) {
      return;
    }
    stopping = true;
    log(`${signal} received, shutting down`);
    const forceExit = setTimeout(() => {
      db.close();
      process.exit(0);
    }, 10_000);
    forceExit.unref();
    server.close(() => {
      db.close();
      log("stopped");
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

try {
  main();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[nbins] configuration error: ${error.message}`);
    process.exit(78);
  }
  throw error;
}
