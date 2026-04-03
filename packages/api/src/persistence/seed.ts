import { createBaselineInspectionStorage } from "./mock-inspection-db.ts";
import type { InspectionStorageSnapshot } from "./records.ts";

export function createSeedInspectionStorageSnapshot(): InspectionStorageSnapshot {
  return createBaselineInspectionStorage();
}
