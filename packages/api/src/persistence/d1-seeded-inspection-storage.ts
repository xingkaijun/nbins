import type { D1Database } from "@cloudflare/workers-types";
import type { InspectionStorageSnapshot } from "./records.ts";
import type {
  InspectionDetailStorageRecord,
  InspectionSubmissionContextRecord,
  InspectionStorage,
  SubmitCurrentRoundResultStorageMutation
} from "./inspection-storage.ts";
import { createSeedInspectionStorageSnapshot } from "./seed.ts";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";

export class D1SeededInspectionStorage implements InspectionStorage {
  private readonly inner: InspectionStorage;
  private seeded = false;

  constructor(dbOrInner: D1Database | InspectionStorage) {
    this.inner = isInspectionStorage(dbOrInner) ? dbOrInner : new D1InspectionStorage(dbOrInner);
  }

  async read(): Promise<InspectionStorageSnapshot> {
    await this.ensureSeeded();
    return this.inner.read();
  }

  async write(next: InspectionStorageSnapshot): Promise<void> {
    await this.ensureSeeded();
    return this.inner.write(next);
  }

  async readInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    if (this.inner.readInspectionDetail) {
      const detail = await this.inner.readInspectionDetail(inspectionItemId);

      if (detail) {
        this.seeded = true;
        return detail;
      }

      if (this.seeded) {
        return null;
      }

      await this.ensureSeeded();
      return this.inner.readInspectionDetail(inspectionItemId);
    }

    await this.ensureSeeded();
    return null;
  }

  async readSubmissionContext(
    inspectionItemId: string
  ): Promise<InspectionSubmissionContextRecord | null> {
    if (this.inner.readSubmissionContext) {
      const context = await this.inner.readSubmissionContext(inspectionItemId);

      if (context) {
        this.seeded = true;
        return context;
      }

      if (this.seeded) {
        return null;
      }

      await this.ensureSeeded();
      return this.inner.readSubmissionContext(inspectionItemId);
    }

    await this.ensureSeeded();
    return null;
  }

  async submitCurrentRoundResult(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void> {
    await this.ensureSeeded();

    if (!this.inner.submitCurrentRoundResult) {
      const snapshot = await this.inner.read();
      const inspectionItem = snapshot.inspectionItems.find(
        (record) => record.id === mutation.inspectionItem.id
      );
      const inspectionRound = snapshot.inspectionRounds.find(
        (record) => record.id === mutation.inspectionRound.id
      );

      if (!inspectionItem || !inspectionRound) {
        throw new Error("INSPECTION_ITEM_NOT_FOUND");
      }

      Object.assign(inspectionItem, mutation.inspectionItem);
      Object.assign(inspectionRound, mutation.inspectionRound);
      snapshot.comments.push(...mutation.createdComments.map((record) => ({ ...record })));
      await this.inner.write(snapshot);
      return;
    }

    return this.inner.submitCurrentRoundResult(mutation);
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

function isInspectionStorage(value: unknown): value is InspectionStorage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as InspectionStorage;
  return typeof candidate.read === "function" && typeof candidate.write === "function";
}
