import type { D1Database } from "@cloudflare/workers-types";

export interface Bindings {
  APP_NAME?: string;
  APP_ENV?: "development" | "staging" | "production";
  D1_DRIVER?: "mock" | "d1";
  DB?: D1Database;
}
