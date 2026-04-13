import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Bindings {
  APP_NAME?: string;
  APP_ENV?: "development" | "staging" | "production";
  DB?: D1Database;
  BUCKET?: R2Bucket;
  JWT_SECRET?: string;
  N8N_WEBHOOK_URL?: string;
  SQL_CONSOLE_SECRET?: string;
}

