import type { D1Database } from "@cloudflare/workers-types";
import type { InspectionStorageSnapshot } from "./records.ts";
import type {
  InspectionListStorageRecord,
  InspectionDetailStorageRecord,
  InspectionSubmissionContextRecord,
  InspectionStorage,
  SubmitCurrentRoundResultStorageMutation,
  ResolveCommentStorageMutation
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

  async readInspectionList(): Promise<InspectionListStorageRecord> {
    if (this.inner.readInspectionList) {
      const list = await this.inner.readInspectionList();

      if (list.items.length > 0) {
        this.seeded = true;
        return list;
      }

      if (!this.seeded) {
        await this.inner.write(createSeedInspectionStorageSnapshot());
        const seededList = await this.inner.readInspectionList();
        this.seeded = true;
        return seededList;
      }

      return list;
    }

    await this.ensureSeeded();
    return {
      generatedAt: new Date().toISOString(),
      items: []
    };
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

      if (!this.seeded) {
        await this.inner.write(createSeedInspectionStorageSnapshot());
        const seededDetail = await this.inner.readInspectionDetail(inspectionItemId);
        this.seeded = true;
        return seededDetail;
      }

      return null;
    }

    await this.ensureSeeded();
    return null;
  }

  async readSubmittedInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    if (this.inner.readSubmittedInspectionDetail) {
      const detail = await this.inner.readSubmittedInspectionDetail(inspectionItemId);

      if (detail) {
        this.seeded = true;
        return detail;
      }

      if (!this.seeded) {
        await this.inner.write(createSeedInspectionStorageSnapshot());
        const seededDetail = await this.inner.readSubmittedInspectionDetail(inspectionItemId);
        this.seeded = true;
        return seededDetail;
      }

      return null;
    }

    return this.readInspectionDetail(inspectionItemId);
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

      if (!this.seeded) {
        await this.inner.write(createSeedInspectionStorageSnapshot());
        const seededContext = await this.inner.readSubmissionContext(inspectionItemId);
        this.seeded = true;
        return seededContext;
      }

      return null;
    }

    await this.ensureSeeded();
    return null;
  }

  async submitCurrentRoundResult(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void> {
    if (!this.inner.submitCurrentRoundResult) {
      await this.ensureSeeded();
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

    try {
      await this.inner.submitCurrentRoundResult(mutation);
      this.seeded = true;
      return;
    } catch (error) {
      if (this.seeded) {
        throw error;
      }

      await this.inner.write(createSeedInspectionStorageSnapshot());
      this.seeded = true;
      return this.inner.submitCurrentRoundResult(mutation);
    }
  }

  async resolveComment(mutation: ResolveCommentStorageMutation): Promise<void> {
    if (!this.inner.resolveComment) {
      await this.ensureSeeded();
      const snapshot = await this.inner.read();
      const inspectionItem = snapshot.inspectionItems.find(
        (record) => record.id === mutation.inspectionItem.id
      );
      const comment = snapshot.comments.find((record) => record.id === mutation.comment.id);

      if (!inspectionItem || !comment) {
        throw new Error("INSPECTION_ITEM_OR_COMMENT_NOT_FOUND");
      }

      Object.assign(inspectionItem, mutation.inspectionItem);
      Object.assign(comment, mutation.comment);
      await this.inner.write(snapshot);
      return;
    }

    try {
      await this.inner.resolveComment(mutation);
      this.seeded = true;
      return;
    } catch (error) {
      if (this.seeded) {
        throw error;
      }

      await this.inner.write(createSeedInspectionStorageSnapshot());
      this.seeded = true;
      return this.inner.resolveComment(mutation);
    }
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
