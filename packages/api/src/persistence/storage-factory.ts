import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "./inspection-storage.ts";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";

const MISSING_DATABASE_MESSAGE =
  "DATABASE_NOT_CONFIGURED: the SQLite database is required (set NBINS_DB_PATH and start the API with `pnpm start` / `pnpm dev`).";

export function createInspectionStorage(bindings?: Bindings): InspectionStorage {
  if (bindings?.DB) {
    return new D1SeededInspectionStorage(bindings.DB);
  }

  throw new Error(MISSING_DATABASE_MESSAGE);
}

export function createInspectionStorageResolver(): (bindings?: Bindings) => InspectionStorage {
  return (bindings?: Bindings): InspectionStorage => createInspectionStorage(bindings);
}
