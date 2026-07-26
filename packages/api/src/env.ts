import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Bindings {
  APP_NAME?: string;
  APP_ENV?: "development" | "staging" | "production";
  DB?: D1Database;
  BUCKET?: R2Bucket;
  JWT_SECRET?: string;
  N8N_WEBHOOK_URL?: string;
  SQL_CONSOLE_SECRET?: string;
  /** 逗号分隔的额外 CORS 来源（如 ITP 站点域名），无需改代码即可扩展白名单 */
  EXTRA_CORS_ORIGINS?: string;
}

