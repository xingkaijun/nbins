import type { InspectionStorageSnapshot } from "./records.ts";

export interface InspectionStorage {
  read(): Promise<InspectionStorageSnapshot>;
  write(next: InspectionStorageSnapshot): Promise<void>;
  reset?(seed?: InspectionStorageSnapshot): Promise<void>;
}
