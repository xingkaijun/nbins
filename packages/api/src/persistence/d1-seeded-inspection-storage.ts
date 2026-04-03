import type { D1Database } from "@cloudflare/workers-types";
import type { InspectionStorageSnapshot } from "./records.ts";
import type { InspectionStorage } from "./inspection-storage.ts";
import { createSeedInspectionStorageSnapshot } from "./seed.ts";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";

export class D1SeededInspectionStorage implements InspectionStorage {
  private readonly inner: D1InspectionStorage;
  private seeded = false;

  constructor(db: D1Database) {
    this.inner = new D1InspectionStorage(db);
  }

  async read(): Promise<InspectionStorageSnapshot> {
    await this.ensureSeeded();
    return this.inner.read();
  }

  async write(next: InspectionStorageSnapshot): Promise<void> {
    await this.ensureSeeded();
    return this.inner.write(next);
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) {
      return;
    }

    const snapshot = await this.inner.read();

    if (snapshot.inspectionItems.length === 0) {
      await this.inner.write(createSeedInspectionStorageSnapshot());
    }

    this.seeded = true;
  }
}
