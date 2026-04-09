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

/**
 * D1SeededInspectionStorage wraps a D1InspectionStorage and ensures that
 * the database has been seeded with a default admin user on first access.
 *
 * Seeding is ONLY triggered when the `users` table is completely empty.
 * This prevents accidental data overwrites during hot-reloads.
 */
export class D1SeededInspectionStorage implements InspectionStorage {
  private readonly inner: InspectionStorage;
  private readonly db: D1Database;
  private seeded = false;

  constructor(dbOrInner: D1Database | InspectionStorage) {
    if (isInspectionStorage(dbOrInner)) {
      this.inner = dbOrInner;
      // We won't have a raw DB handle in this case, but seed check
      // will fall back to reading all users via inner.read()
      this.db = null as any;
    } else {
      this.db = dbOrInner;
      this.inner = new D1InspectionStorage(dbOrInner);
    }
  }

  /**
   * The ONLY seeding gate: check if the `users` table has at least one row.
   * If yes → mark seeded, do nothing.
   * If no  → write the seed snapshot (which contains only the admin user).
   */
  private async ensureSeeded(): Promise<void> {
    if (this.seeded) {
      return;
    }

    let hasUsers = false;

    if (this.db) {
      // Fast path: direct SQL count
      const result = await this.db.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
      hasUsers = (result?.cnt ?? 0) > 0;
    } else {
      // Fallback: read full snapshot
      const snapshot = await this.inner.read();
      hasUsers = snapshot.users.length > 0;
    }

    if (!hasUsers) {
      await this.inner.write(createSeedInspectionStorageSnapshot());
    }

    this.seeded = true;
  }

  // ── Delegated methods: all simply ensureSeeded() then delegate ──

  async read(): Promise<InspectionStorageSnapshot> {
    await this.ensureSeeded();
    return this.inner.read();
  }

  async write(next: InspectionStorageSnapshot): Promise<void> {
    await this.ensureSeeded();
    return this.inner.write(next);
  }

  async readUserById(id: string) {
    await this.ensureSeeded();
    if (this.inner.readUserById) {
      return this.inner.readUserById(id);
    }
    const snapshot = await this.inner.read();
    return snapshot.users.find((user) => user.id === id) ?? null;
  }

  async readUserByUsername(username: string) {
    await this.ensureSeeded();
    if (this.inner.readUserByUsername) {
      return this.inner.readUserByUsername(username);
    }
    const snapshot = await this.inner.read();
    return (
      snapshot.users.find(
        (user) => user.username.trim().toLowerCase() === username.trim().toLowerCase()
      ) ?? null
    );
  }

  async readProjectMembersByUserId(userId: string) {
    await this.ensureSeeded();
    if (this.inner.readProjectMembersByUserId) {
      return this.inner.readProjectMembersByUserId(userId);
    }
    const snapshot = await this.inner.read();
    return snapshot.projectMembers.filter((member) => member.userId === userId);
  }

  async readInspectionList(): Promise<InspectionListStorageRecord> {
    await this.ensureSeeded();
    if (this.inner.readInspectionList) {
      return this.inner.readInspectionList();
    }
    return {
      generatedAt: new Date().toISOString(),
      items: []
    };
  }

  async readInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    await this.ensureSeeded();
    if (this.inner.readInspectionDetail) {
      return this.inner.readInspectionDetail(inspectionItemId);
    }
    return null;
  }

  async readSubmittedInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    await this.ensureSeeded();
    if (this.inner.readSubmittedInspectionDetail) {
      return this.inner.readSubmittedInspectionDetail(inspectionItemId);
    }
    return this.readInspectionDetail(inspectionItemId);
  }

  async readSubmissionContext(
    inspectionItemId: string
  ): Promise<InspectionSubmissionContextRecord | null> {
    await this.ensureSeeded();
    if (this.inner.readSubmissionContext) {
      return this.inner.readSubmissionContext(inspectionItemId);
    }
    return null;
  }

  async submitCurrentRoundResult(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void> {
    await this.ensureSeeded();
    if (this.inner.submitCurrentRoundResult) {
      return this.inner.submitCurrentRoundResult(mutation);
    }

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
  }

  async resolveComment(mutation: ResolveCommentStorageMutation): Promise<void> {
    await this.ensureSeeded();
    if (this.inner.resolveComment) {
      return this.inner.resolveComment(mutation);
    }

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
  }
}

function isInspectionStorage(value: unknown): value is InspectionStorage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as InspectionStorage;
  return typeof candidate.read === "function" && typeof candidate.write === "function";
}
