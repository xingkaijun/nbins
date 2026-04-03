import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "./inspection-storage.ts";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";
import { createMockInspectionDatabase } from "./mock-inspection-db.ts";

export function createInspectionStorage(bindings?: Bindings): InspectionStorage {
  if (bindings?.D1_DRIVER === "d1" && bindings.DB) {
    return new D1SeededInspectionStorage(bindings.DB);
  }

  return createMockInspectionDatabase();
}

export function createInspectionStorageResolver(): (bindings?: Bindings) => InspectionStorage {
  const mockStorage = createMockInspectionDatabase();

  return (bindings?: Bindings): InspectionStorage => {
    if (bindings?.D1_DRIVER === "d1" && bindings.DB) {
      return new D1SeededInspectionStorage(bindings.DB);
    }

    return mockStorage;
  };
}
