import type { SqlDatabase } from "./platform/sql-database.ts";
import type { ObjectStore } from "./platform/object-store.ts";

/**
 * Per-request environment handed to the Hono app (`app.fetch(request, env)`).
 * On the local server it is built once at start-up from process.env by
 * src/config.ts; tests pass their own.
 */
export interface Bindings {
  APP_NAME?: string;
  APP_ENV?: "development" | "staging" | "production";
  /** SQLite database (LocalSqliteDatabase in production). */
  DB?: SqlDatabase;
  /** Object store for NCR/FAT records, media, attachments and PDFs (FileSystemObjectStore in production). */
  BUCKET?: ObjectStore;
  JWT_SECRET?: string;
  N8N_WEBHOOK_URL?: string;
  SQL_CONSOLE_SECRET?: string;
  /** Extra allowed CORS origins, comma separated (NBINS_CORS_ORIGINS). */
  CORS_ORIGINS?: string;
}
