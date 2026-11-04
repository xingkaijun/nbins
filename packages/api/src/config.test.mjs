import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { ConfigError, loadConfig, normalizeBasePath } from "./config.ts";

// loadConfig resolves paths with the platform's own rules, so the expected
// values are built the same way: the literals below are POSIX examples that a
// Windows checkout resolves to a local drive path.
const at = (base, ...parts) => resolve(base, ...parts);

test("defaults bind to localhost and keep data under ./data", () => {
  const config = loadConfig({}, "/srv/nbins");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.dbPath, at("/srv/nbins", "data", "nbins.db"));
  assert.equal(config.storageDir, at("/srv/nbins", "data", "storage"));
  assert.equal(config.backupDir, at("/srv/nbins", "data", "backups"));
  assert.equal(config.webDistDir, null);
  assert.equal(config.webBasePath, "/nbins/");
  assert.equal(config.autoMigrate, true);
  assert.equal(config.appEnv, "development");
  assert.equal(config.sqlConsoleSecret, undefined);
});

test("explicit settings are honoured and relative paths resolve against cwd", () => {
  const config = loadConfig(
    {
      NBINS_HOST: "0.0.0.0",
      NBINS_PORT: "9000",
      NBINS_DATA_DIR: "/var/lib/nbins",
      NBINS_DB_PATH: "db/main.db",
      NBINS_WEB_DIST: "packages/web/dist",
      NBINS_WEB_BASE: "app",
      NBINS_AUTO_MIGRATE: "false",
      APP_ENV: "production",
      JWT_SECRET: "s",
      SQL_CONSOLE_SECRET: "  ",
      NBINS_CORS_ORIGINS: "https://a.example"
    },
    "/opt/nbins"
  );
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 9000);
  assert.equal(config.dbPath, at("/opt/nbins", "db", "main.db"));
  // The data dir is used verbatim, so storage hangs off it with one separator.
  assert.equal(config.storageDir, at("/var/lib/nbins", "storage"));
  assert.equal(config.webDistDir, at("/opt/nbins", "packages", "web", "dist"));
  assert.equal(config.webBasePath, "/app/");
  assert.equal(config.autoMigrate, false);
  assert.equal(config.sqlConsoleSecret, undefined, "blank secret keeps the SQL console disabled");
  assert.equal(config.corsOrigins, "https://a.example");
});

test("production refuses to start without JWT_SECRET; bad values are rejected", () => {
  assert.throws(() => loadConfig({ APP_ENV: "production" }), ConfigError);
  assert.throws(() => loadConfig({ NBINS_PORT: "http" }), /NBINS_PORT/);
  assert.throws(() => loadConfig({ APP_ENV: "prod" }), /APP_ENV/);
  assert.throws(() => loadConfig({ NBINS_AUTO_MIGRATE: "maybe" }), /boolean/);
  assert.equal(normalizeBasePath("/nbins"), "/nbins/");
  assert.equal(normalizeBasePath("/"), "/");
});
