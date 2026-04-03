import type {
  InspectionItemDetailResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";
import { applyInspectionResultSubmission } from "../domain/inspection-item-submission.ts";
import { resolveInspectionItemState } from "../domain/inspection-item-state.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import { cloneStorageSnapshot } from "../persistence/mock-inspection-db.ts";
import type { CommentRecord, InspectionStorageSnapshot } from "../persistence/records.ts";
import {
  mapInspectionDetailFromStorage,
  selectInspectionDetailRecord
} from "./inspection-detail-mapper.ts";

export class InspectionRepository {
  private readonly db: InspectionStorage;

  constructor(db: InspectionStorage) {
    this.db = db;
  }

  async getInspectionDetail(inspectionItemId: string): Promise<InspectionItemDetailResponse | null> {
    const selected = selectInspectionDetailRecord(await this.db.read(), inspectionItemId);
    return selected ? mapInspectionDetailFromStorage(selected) : null;
  }

  async submitCurrentRoundResult(
    inspectionItemId: string,
    submission: SubmitInspectionResultRequest
  ): Promise<SubmitInspectionResultResponse> {
    const storage = cloneStorageSnapshot(await this.db.read());
    const selected = selectInspectionDetailRecord(storage, inspectionItemId);

    if (!selected) {
      throw new Error("INSPECTION_ITEM_NOT_FOUND");
    }

    if (submission.expectedVersion !== selected.item.version) {
      throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");
    }

    const currentDetail = mapInspectionDetailFromStorage(selected);
    const submittedAt = submission.submittedAt ?? new Date().toISOString();
    const inspectorDisplayName =
      submission.inspectorDisplayName?.trim() || submission.submittedBy.trim();

    const output = applyInspectionResultSubmission({
      item: currentDetail,
      submission: {
        ...submission,
        submittedAt,
        inspectorDisplayName
      }
    });

    const now = submittedAt;
    const itemRecord = storage.inspectionItems.find((record) => record.id === inspectionItemId);

    if (!itemRecord) {
      throw new Error("INSPECTION_ITEM_NOT_FOUND");
    }

    const roundRecord = storage.inspectionRounds.find(
      (record) =>
        record.inspectionItemId === inspectionItemId &&
        record.roundNumber === itemRecord.currentRound
    );

    if (!roundRecord) {
      throw new Error("INSPECTION_ROUND_NOT_FOUND");
    }

    roundRecord.actualDate = submission.actualDate;
    roundRecord.result = submission.result;
    roundRecord.inspectedBy = submission.submittedBy;
    roundRecord.notes = submission.notes ?? null;
    roundRecord.updatedAt = now;

    const newCommentRecords = output.createdComments.map((comment, index) =>
      createCommentRecord({
        inspectionItemId,
        roundId: roundRecord.id,
        authorId: submission.submittedBy,
        now,
        content: comment.message,
        suffix: String(index + 1)
      })
    );

    storage.comments.push(...newCommentRecords);

    const nextState = resolveInspectionItemState({
      latestSubmittedResult: submission.result,
      openCommentCount: storage.comments.filter(
        (record) => record.inspectionItemId === inspectionItemId && record.status === "open"
      ).length
    });

    itemRecord.workflowStatus = nextState.workflowStatus;
    itemRecord.resolvedResult = nextState.resolvedResult;
    itemRecord.lastRoundResult = nextState.lastRoundResult;
    itemRecord.openCommentsCount = nextState.openCommentCount;
    itemRecord.version += 1;
    itemRecord.updatedAt = now;

    if (this.db.submitCurrentRoundResult) {
      await this.db.submitCurrentRoundResult({
        inspectionItem: { ...itemRecord },
        inspectionRound: { ...roundRecord },
        createdComments: newCommentRecords.map((record) => ({ ...record }))
      });
    } else {
      await this.db.write(storage);
    }

    const refreshedDetail = await this.getInspectionDetail(inspectionItemId);

    if (!refreshedDetail) {
      throw new Error("INSPECTION_ITEM_NOT_FOUND");
    }

    const createdRoundHistoryEntry =
      refreshedDetail.roundHistory[refreshedDetail.roundHistory.length - 1];

    return {
      item: refreshedDetail,
      createdRoundHistoryEntry,
      createdComments: refreshedDetail.comments.slice(-newCommentRecords.length)
    };
  }
}

function createCommentRecord(input: {
  inspectionItemId: string;
  roundId: string;
  authorId: string;
  content: string;
  now: string;
  suffix: string;
}): CommentRecord {
  return {
    id: `${input.inspectionItemId}-comment-${input.roundId}-${input.suffix}`,
    inspectionItemId: input.inspectionItemId,
    createdInRoundId: input.roundId,
    closedInRoundId: null,
    authorId: input.authorId,
    content: input.content,
    status: "open",
    closedBy: null,
    closedAt: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function createInspectionRepositorySnapshot(
  db: InspectionStorage
): Promise<InspectionStorageSnapshot> {
  return db.read().then(cloneStorageSnapshot);
}
