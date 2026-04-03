import type { InspectionStorageSnapshot } from "./records.ts";

export interface InspectionStorage {
  read(): InspectionStorageSnapshot;
  write(next: InspectionStorageSnapshot): void;
  reset?(seed?: InspectionStorageSnapshot): void;
}
