import type {
  InspectionItemDetailResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";
import { applyInspectionResultSubmission } from "../domain/inspection-item-submission.ts";
import { resolveInspectionItemState } from "../domain/inspection-item-state.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import { cloneStorageSnapshot } from "../persistence/mock-inspection-db.ts";
import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  InspectionStorageSnapshot
} from "../persistence/records.ts";
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
    if (this.db.readInspectionDetail) {
      const selected = await this.db.readInspectionDetail(inspectionItemId);
      if (selected) {
        return mapInspectionDetailFromStorage(selected);
      }
    }

    const selected = selectInspectionDetailRecord(await this.db.read(), inspectionItemId);
    return selected ? mapInspectionDetailFromStorage(selected) : null;
  }

  async submitCurrentRoundResult(
    inspectionItemId: string,
    submission: SubmitInspectionResultRequest
  ): Promise<SubmitInspectionResultResponse> {
    const submittedAt = submission.submittedAt ?? new Date().toISOString();
    const inspectorDisplayName =
      submission.inspectorDisplayName?.trim() || submission.submittedBy.trim();
    const submissionContext = this.db.readSubmissionContext
      ? await this.db.readSubmissionContext(inspectionItemId)
      : null;
    let storage: InspectionStorageSnapshot | null = null;
    let itemRecord: InspectionItemRecord;
    let roundRecord: InspectionRoundRecord;
    let openCommentCount: number;

    if (submissionContext) {
      if (submission.expectedVersion !== submissionContext.item.version) {
        throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");
      }

      itemRecord = { ...submissionContext.item };
      roundRecord = { ...submissionContext.currentRound };
      openCommentCount = submissionContext.openCommentCount;
    } else {
      storage = cloneStorageSnapshot(await this.db.read());
      const selected = selectInspectionDetailRecord(storage, inspectionItemId);

      if (!selected) {
        throw new Error("INSPECTION_ITEM_NOT_FOUND");
      }

      if (submission.expectedVersion !== selected.item.version) {
        throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");
      }

      const foundItemRecord = storage.inspectionItems.find((record) => record.id === inspectionItemId);

      if (!foundItemRecord) {
        throw new Error("INSPECTION_ITEM_NOT_FOUND");
      }

      itemRecord = foundItemRecord;

      const foundRoundRecord = storage.inspectionRounds.find(
        (record) =>
          record.inspectionItemId === inspectionItemId &&
          record.roundNumber === itemRecord.currentRound
      );

      if (!foundRoundRecord) {
        throw new Error("INSPECTION_ROUND_NOT_FOUND");
      }

      roundRecord = foundRoundRecord;
      openCommentCount = storage.comments.filter(
        (record) => record.inspectionItemId === inspectionItemId && record.status === "open"
      ).length;
    }

    const currentDetail = createSubmissionDetail({
      item: itemRecord,
      currentRound: roundRecord,
      openCommentCount
    });

    const output = applyInspectionResultSubmission({
      item: currentDetail,
      submission: {
        ...submission,
        submittedAt,
        inspectorDisplayName
      }
    });

    const now = submittedAt;
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

    if (storage) {
      storage.comments.push(...newCommentRecords);
    }

    const nextState = resolveInspectionItemState({
      latestSubmittedResult: submission.result,
      openCommentCount: openCommentCount + newCommentRecords.length
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
      if (!storage) {
        throw new Error("INSPECTION_STORAGE_SNAPSHOT_REQUIRED");
      }

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

function createSubmissionDetail(input: {
  item: InspectionItemRecord;
  currentRound: InspectionRoundRecord;
  openCommentCount: number;
}): InspectionItemDetailResponse {
  const state = resolveInspectionItemState({
    latestSubmittedResult: input.item.lastRoundResult,
    openCommentCount: input.openCommentCount
  });

  return {
    id: input.item.id,
    projectCode: "",
    projectName: "",
    hullNumber: "",
    shipName: "",
    itemName: input.item.itemName,
    discipline: input.item.discipline,
    source: input.item.source,
    yardQc: input.currentRound.yardQc ?? "",
    plannedDate: input.currentRound.plannedDate,
    actualDate: input.currentRound.actualDate,
    currentRound: input.item.currentRound,
    currentRoundId: input.currentRound.id,
    version: input.item.version,
    workflowStatus: state.workflowStatus,
    resolvedResult: state.resolvedResult,
    lastRoundResult: state.lastRoundResult,
    openCommentCount: state.openCommentCount,
    pendingFinalAcceptance: state.pendingFinalAcceptance,
    waitingForNextRound: state.waitingForNextRound,
    comments: Array.from({ length: input.openCommentCount }, (_, index) => ({
      id: `existing-open-comment-${index + 1}`,
      roundNumber: input.item.currentRound,
      status: "open",
      message: "",
      createdAt: "",
      createdBy: "",
      resolvedAt: null,
      resolvedBy: null
    })),
    roundHistory: Array.from({ length: input.item.currentRound }, (_, index) => ({
      id: index + 1 === input.item.currentRound ? input.currentRound.id : `${input.item.id}-round-${index + 1}`,
      roundNumber: index + 1,
      actualDate: index + 1 === input.item.currentRound ? input.currentRound.actualDate : null,
      submittedResult: index + 1 === input.item.currentRound ? input.item.lastRoundResult : null,
      submittedAt: index + 1 === input.item.currentRound ? "" : "",
      submittedBy: "",
      inspectorDisplayName: "",
      notes: null,
      source: input.item.source,
      commentIds: []
    }))
  };
}

export function createInspectionRepositorySnapshot(
  db: InspectionStorage
): Promise<InspectionStorageSnapshot> {
  return db.read().then(cloneStorageSnapshot);
}
