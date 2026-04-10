import type { D1Database } from "@cloudflare/workers-types";

export interface Bindings {
  APP_NAME?: string;
  APP_ENV?: "development" | "staging" | "production";
  DB?: D1Database;
  JWT_SECRET?: string;
  N8N_WEBHOOK_URL?: string;
}
