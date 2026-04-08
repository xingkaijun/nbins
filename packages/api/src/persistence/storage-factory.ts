import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "./inspection-storage.ts";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";

export function createInspectionStorage(bindings?: Bindings): InspectionStorage {
  if (bindings?.DB) {
    return new D1SeededInspectionStorage(bindings.DB);
  }

  throw new Error("D1_DATABASE_BINDING_MISSING: D1 database is required for production and local development.");
}

export function createInspectionStorageResolver(): (bindings?: Bindings) => InspectionStorage {
  return (bindings?: Bindings): InspectionStorage => {
    if (bindings?.DB) {
      return new D1SeededInspectionStorage(bindings.DB);
    }
    
    throw new Error("D1_DATABASE_BINDING_MISSING: Storage resolver requires a D1 database binding.");
  };
}
