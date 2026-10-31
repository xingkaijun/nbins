/**
 * Server configuration, read from environment variables (see .env.example).
 *
 * | Variable             | Default               | Meaning                                              |
 * |----------------------|-----------------------|------------------------------------------------------|
 * | NBINS_HOST           | 127.0.0.1             | Listen address. Keep 127.0.0.1 behind nginx.         |
 * | NBINS_PORT           | 8787                  | Listen port.                                         |
 * | NBINS_DATA_DIR       | ./data                | Base directory for the two paths below.              |
 * | NBINS_DB_PATH        | $NBINS_DATA_DIR/nbins.db | SQLite database file.                             |
 * | NBINS_STORAGE_DIR    | $NBINS_DATA_DIR/storage  | Files: NCR/FAT records, media, attachments, PDFs. |
 * | NBINS_BACKUP_DIR     | $NBINS_DATA_DIR/backups  | Where `backup` writes.                            |
 * | NBINS_WEB_DIST       | (unset)               | If set, also serve the built web app from this dir.  |
 * | NBINS_WEB_BASE       | /nbins/               | URL base the web app is served under.                |
 * | NBINS_AUTO_MIGRATE   | true                  | Apply pending schema migrations at start-up.         |
 * | NBINS_CORS_ORIGINS   | (unset)               | Extra allowed CORS origins, comma separated.         |
 * | APP_ENV              | development           | development / staging / production                   |
 * | APP_NAME             | nbins                 |                                                      |
 * | JWT_SECRET           | (required in prod)    | Secret for signing login tokens.                     |
 * | N8N_WEBHOOK_URL      | (unset)               | Optional webhook for new NCRs.                       |
 * | SQL_CONSOLE_SECRET   | (unset = disabled)    | Enables the admin SQL console.                       |
 *
 * Relative paths are resolved against the process working directory.
 */
import { isAbsolute, resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  storageDir: string;
  backupDir: string;
  webDistDir: string | null;
  webBasePath: string;
  autoMigrate: boolean;
  appEnv: "development" | "staging" | "production";
  appName: string;
  jwtSecret: string | undefined;
  n8nWebhookUrl: string | undefined;
  sqlConsoleSecret: string | undefined;
  corsOrigins: string | undefined;
}

export class ConfigError extends Error {}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolvePath(value: string, cwd: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value);
}

export function normalizeBasePath(value: string | undefined): string {
  const raw = nonEmpty(value) ?? "/nbins/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = nonEmpty(value)?.toLowerCase();
  if (normalized === undefined) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new ConfigError(`Invalid boolean value: ${value}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): ServerConfig {
  const portText = nonEmpty(env.NBINS_PORT) ?? "8787";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`NBINS_PORT must be an integer 0-65535, got ${JSON.stringify(portText)}`);
  }

  const appEnvText = nonEmpty(env.APP_ENV) ?? "development";
  if (appEnvText !== "development" && appEnvText !== "staging" && appEnvText !== "production") {
    throw new ConfigError(`APP_ENV must be development, staging or production, got ${JSON.stringify(appEnvText)}`);
  }

  const dataDir = resolvePath(nonEmpty(env.NBINS_DATA_DIR) ?? "data", cwd);
  const webDist = nonEmpty(env.NBINS_WEB_DIST);
  const jwtSecret = nonEmpty(env.JWT_SECRET);

  if (appEnvText === "production" && !jwtSecret) {
    throw new ConfigError("JWT_SECRET is required when APP_ENV=production");
  }

  return {
    host: nonEmpty(env.NBINS_HOST) ?? "127.0.0.1",
    port,
    dataDir,
    dbPath: resolvePath(nonEmpty(env.NBINS_DB_PATH) ?? resolve(dataDir, "nbins.db"), cwd),
    storageDir: resolvePath(nonEmpty(env.NBINS_STORAGE_DIR) ?? resolve(dataDir, "storage"), cwd),
    backupDir: resolvePath(nonEmpty(env.NBINS_BACKUP_DIR) ?? resolve(dataDir, "backups"), cwd),
    webDistDir: webDist ? resolvePath(webDist, cwd) : null,
    webBasePath: normalizeBasePath(env.NBINS_WEB_BASE),
    autoMigrate: parseBoolean(env.NBINS_AUTO_MIGRATE, true),
    appEnv: appEnvText,
    appName: nonEmpty(env.APP_NAME) ?? "nbins",
    jwtSecret,
    n8nWebhookUrl: nonEmpty(env.N8N_WEBHOOK_URL),
    sqlConsoleSecret: nonEmpty(env.SQL_CONSOLE_SECRET),
    corsOrigins: nonEmpty(env.NBINS_CORS_ORIGINS)
  };
}

/**
 * Load KEY=VALUE pairs from an env file into process.env without overriding
 * variables that are already set. Uses NBINS_ENV_FILE, else ./.env if present.
 */
export function loadEnvFileIfPresent(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const candidate = resolvePath(nonEmpty(env.NBINS_ENV_FILE) ?? ".env", cwd);
  try {
    process.loadEnvFile(candidate);
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !nonEmpty(env.NBINS_ENV_FILE)) {
      return null;
    }
    throw error;
  }
}
