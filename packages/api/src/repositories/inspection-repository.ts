import type {
  DashboardSnapshot,
  InspectionItemDetailResponse,
  InspectionListItem,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";
import { applyInspectionResultSubmission } from "../domain/inspection-item-submission.ts";
import { resolveInspectionItemState } from "../domain/inspection-item-state.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  InspectionStorageSnapshot
} from "../persistence/records.ts";
import { cloneStorageSnapshot } from "../persistence/records.ts";
import {
  mapInspectionDetailFromStorage,
  selectInspectionDetailRecord
} from "./inspection-detail-mapper.ts";

export class InspectionRepository {
  private readonly db: InspectionStorage;

  constructor(db: InspectionStorage) {
    this.db = db;
  }

  async listInspections(allowedProjectIds?: string[], projectId?: string): Promise<DashboardSnapshot> {
    if (this.db.readInspectionList) {
      const selected = await this.db.readInspectionList();
      const items = selected.items
        .filter((record) => isProjectVisible(record.project.id, allowedProjectIds, projectId))
        .map(mapInspectionListItemRecord);

      return {
        generatedAt: selected.generatedAt,
        summary: createDashboardSummary(items),
        items
      };
    }

    const snapshot = await this.db.read();
    const items = snapshot.inspectionItems
      .map((item) => {
        const ship = snapshot.ships.find((record) => record.id === item.shipId);

        if (!ship) {
          return null;
        }

        const project = snapshot.projects.find((record) => record.id === ship.projectId);
        const currentRound = snapshot.inspectionRounds.find(
          (record) =>
            record.inspectionItemId === item.id && record.roundNumber === item.currentRound
        );

        if (!project || !currentRound) {
          return null;
        }

        if (!isProjectAllowed(project.id, allowedProjectIds)) {
          return null;
        }

        return mapInspectionListItemRecord({ item, ship, project, currentRound });
      })
      .filter((record): record is InspectionListItem => record !== null);

    return {
      generatedAt: new Date().toISOString(),
      summary: createDashboardSummary(items),
      items
    };
  }

  async getInspectionDetail(
    inspectionItemId: string,
    allowedProjectIds?: string[]
  ): Promise<InspectionItemDetailResponse | null> {
    if (this.db.readInspectionDetail) {
      const selected = await this.db.readInspectionDetail(inspectionItemId);
      if (selected) {
        return isProjectAllowed(selected.project.id, allowedProjectIds)
          ? mapInspectionDetailFromStorage(selected)
          : null;
      }
    }

    const selected = selectInspectionDetailRecord(await this.db.read(), inspectionItemId);
    return selected && isProjectAllowed(selected.project.id, allowedProjectIds)
      ? mapInspectionDetailFromStorage(selected)
      : null;
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

    const allItemComments = storage 
      ? storage.comments.filter(c => c.inspectionItemId === inspectionItemId)
      : (await this.getInspectionDetail(inspectionItemId))?.comments ?? [];
    
    // 计算当前 inspection item 的最大 localId
    const maxLocalId = allItemComments.reduce((max, c) => {
        const cid = (c as any).localId || 0;
        return Math.max(max, cid);
    }, 0);

    const currentDetail = createSubmissionDetail({
      item: itemRecord,
      currentRound: roundRecord,
      openCommentCount,
      totalCommentCount: allItemComments.length
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
        localId: maxLocalId + index + 1,
        suffix: String(index + 1)
      })
    );

    if (storage) {
      storage.comments.push(...newCommentRecords);
    }

    const nextState = resolveInspectionItemState({
      latestSubmittedResult: submission.result,
      openCommentCount: openCommentCount + newCommentRecords.length,
      totalCommentCount: allItemComments.length + newCommentRecords.length
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

    const refreshedDetail = this.db.readSubmittedInspectionDetail
      ? await this.db.readSubmittedInspectionDetail(inspectionItemId).then((selected) =>
          selected ? mapInspectionDetailFromStorage(selected) : null
        )
      : await this.getInspectionDetail(inspectionItemId);

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

  async resolveComment(
    inspectionItemId: string,
    commentId: string,
    request: { resolvedBy: string; expectedVersion: number; remark?: string }
  ): Promise<InspectionItemDetailResponse> {
    const detail = await this.getInspectionDetail(inspectionItemId);
    const storage = this.db.readSubmissionContext ? null : cloneStorageSnapshot(await this.db.read());

    if (!detail) {
      throw new Error("INSPECTION_ITEM_NOT_FOUND");
    }

    if (detail.version !== request.expectedVersion) {
      throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");
    }

    const comment = detail.comments.find((c) => c.id === commentId);
    if (!comment) {
      throw new Error("COMMENT_NOT_FOUND");
    }

    if (comment.status === "closed") {
      throw new Error("COMMENT_ALREADY_CLOSED");
    }

    const now = new Date().toISOString();
    const nextOpenCommentCount = Math.max(0, detail.openCommentCount - 1);
    const nextState = resolveInspectionItemState({
      latestSubmittedResult: detail.lastRoundResult,
      openCommentCount: nextOpenCommentCount,
      totalCommentCount: detail.comments.length
    });

    const refreshedItemRecord: InspectionItemRecord = storage
      ? storage.inspectionItems.find((i) => i.id === inspectionItemId)!
      : {
          id: detail.id,
          shipId: "", // 不会被 API 写入路径使用
          itemName: detail.itemName,
          itemNameNormalized: detail.itemName.toLowerCase().replace(/[^a-z0-9]/g, ""),
          discipline: detail.discipline,
          workflowStatus: nextState.workflowStatus,
          lastRoundResult: nextState.lastRoundResult,
          resolvedResult: nextState.resolvedResult,
          currentRound: detail.currentRound,
          openCommentsCount: nextState.openCommentCount,
          version: detail.version + 1,
          source: detail.source,
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
       refreshedItemRecord.workflowStatus = nextState.workflowStatus;
       refreshedItemRecord.resolvedResult = nextState.resolvedResult;
       refreshedItemRecord.openCommentsCount = nextState.openCommentCount;
       refreshedItemRecord.version += 1;
       refreshedItemRecord.updatedAt = now;
    }

    const refreshedCommentRecord: CommentRecord = storage
      ? storage.comments.find((c) => c.id === commentId)!
      : {
          id: commentId,
          inspectionItemId,
          createdInRoundId: "", // 不会被 API 写入路径使用
          closedInRoundId: detail.currentRoundId,
          authorId: "", // 不会被 API 写入路径使用
          localId: comment.localId,
          content: comment.message,
          status: "closed",
          closedBy: request.resolvedBy,
          closedAt: now,
          resolveRemark: request.remark?.trim() || null,
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
      refreshedCommentRecord.status = "closed";
      refreshedCommentRecord.closedBy = request.resolvedBy;
      refreshedCommentRecord.closedAt = now;
      refreshedCommentRecord.closedInRoundId = detail.currentRoundId;
      refreshedCommentRecord.resolveRemark = request.remark?.trim() || null;
      refreshedCommentRecord.updatedAt = now;
    }

    if (this.db.resolveComment) {
      await this.db.resolveComment({
        inspectionItem: refreshedItemRecord,
        comment: refreshedCommentRecord
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

    return refreshedDetail;
  }

  async addRemark(
    inspectionItemId: string,
    commentId: string,
    request: { expectedVersion: number; remark: string }
  ): Promise<InspectionItemDetailResponse> {
    const detail = await this.getInspectionDetail(inspectionItemId);
    const storage = this.db.readSubmissionContext ? null : cloneStorageSnapshot(await this.db.read());

    if (!detail) throw new Error("INSPECTION_ITEM_NOT_FOUND");
    if (detail.version !== request.expectedVersion) throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");

    const comment = detail.comments.find((c) => c.id === commentId);
    if (!comment) throw new Error("COMMENT_NOT_FOUND");

    const now = new Date().toISOString();
    
    const refreshedItemRecord: InspectionItemRecord = storage
      ? storage.inspectionItems.find((i) => i.id === inspectionItemId)!
      : {
          id: detail.id,
          shipId: "", 
          itemName: detail.itemName,
          itemNameNormalized: detail.itemName.toLowerCase().replace(/[^a-z0-9]/g, ""),
          discipline: detail.discipline,
          workflowStatus: detail.workflowStatus,
          lastRoundResult: detail.lastRoundResult,
          resolvedResult: detail.resolvedResult,
          currentRound: detail.currentRound,
          openCommentsCount: detail.openCommentCount,
          version: detail.version + 1,
          source: detail.source,
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
       refreshedItemRecord.version += 1;
       refreshedItemRecord.updatedAt = now;
    }

    const refreshedCommentRecord: CommentRecord = storage
      ? storage.comments.find((c) => c.id === commentId)!
      : {
          id: commentId,
          inspectionItemId,
          createdInRoundId: "", 
          closedInRoundId: comment.status === "closed" ? detail.currentRoundId : null,
          authorId: "", 
          localId: comment.localId,
          content: comment.message,
          status: comment.status,
          closedBy: comment.resolvedBy,
          closedAt: comment.resolvedAt,
          resolveRemark: request.remark.trim() || null,
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
      refreshedCommentRecord.resolveRemark = request.remark.trim() || null;
      refreshedCommentRecord.updatedAt = now;
      await this.db.write(storage);
    } else {
      // Not using full storage snapshot -> assume direct db call supported
      // For now fallback to simple write if no dedicated addRemark exists
      if (this.db.resolveComment) {
         // Using resolveComment is slightly hacky but achieves the same partial update in mock
         await this.db.resolveComment({
           inspectionItem: refreshedItemRecord,
           comment: refreshedCommentRecord
         });
      } else {
         throw new Error("INSPECTION_STORAGE_NON_SNAPSHOT_UNSUPPORTED");
      }
    }

    const refreshedDetail = await this.getInspectionDetail(inspectionItemId);
    if (!refreshedDetail) throw new Error("INSPECTION_ITEM_NOT_FOUND");
    return refreshedDetail;
  }

  async reopenComment(
    inspectionItemId: string,
    commentId: string,
    request: { expectedVersion: number }
  ): Promise<InspectionItemDetailResponse> {
    const detail = await this.getInspectionDetail(inspectionItemId);
    const storage = this.db.readSubmissionContext ? null : cloneStorageSnapshot(await this.db.read());

    if (!detail) throw new Error("INSPECTION_ITEM_NOT_FOUND");
    if (detail.version !== request.expectedVersion) throw new Error("INSPECTION_ITEM_VERSION_CONFLICT");

    const comment = detail.comments.find((c) => c.id === commentId);
    if (!comment) throw new Error("COMMENT_NOT_FOUND");
    if (comment.status === "open") throw new Error("COMMENT_ALREADY_OPEN");

    const now = new Date().toISOString();
    const nextOpenCommentCount = detail.openCommentCount + 1;
    const nextState = resolveInspectionItemState({
      latestSubmittedResult: detail.lastRoundResult,
      openCommentCount: nextOpenCommentCount,
      totalCommentCount: detail.comments.length
    });

    const refreshedItemRecord: InspectionItemRecord = storage
      ? storage.inspectionItems.find((i) => i.id === inspectionItemId)!
      : {
          id: detail.id,
          shipId: "", 
          itemName: detail.itemName,
          itemNameNormalized: detail.itemName.toLowerCase().replace(/[^a-z0-9]/g, ""),
          discipline: detail.discipline,
          workflowStatus: nextState.workflowStatus,
          lastRoundResult: nextState.lastRoundResult,
          resolvedResult: nextState.resolvedResult,
          currentRound: detail.currentRound,
          openCommentsCount: nextState.openCommentCount,
          version: detail.version + 1,
          source: detail.source,
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
       refreshedItemRecord.workflowStatus = nextState.workflowStatus;
       refreshedItemRecord.resolvedResult = nextState.resolvedResult;
       refreshedItemRecord.openCommentsCount = nextState.openCommentCount;
       refreshedItemRecord.version += 1;
       refreshedItemRecord.updatedAt = now;
    }

    const refreshedCommentRecord: CommentRecord = storage
      ? storage.comments.find((c) => c.id === commentId)!
      : {
          id: commentId,
          inspectionItemId,
          createdInRoundId: "", 
          closedInRoundId: null,
          authorId: "", 
          localId: comment.localId,
          content: comment.message,
          status: "open",
          closedBy: null,
          closedAt: null,
          resolveRemark: comment.resolveRemark, // Keep the remark
          createdAt: "",
          updatedAt: now
        };

    if (storage) {
      refreshedCommentRecord.status = "open";
      refreshedCommentRecord.closedBy = null;
      refreshedCommentRecord.closedAt = null;
      refreshedCommentRecord.closedInRoundId = null;
      refreshedCommentRecord.updatedAt = now;
      await this.db.write(storage);
    } else {
      if (this.db.resolveComment) {
         await this.db.resolveComment({
           inspectionItem: refreshedItemRecord,
           comment: refreshedCommentRecord
         });
      }
    }

    const refreshedDetail = await this.getInspectionDetail(inspectionItemId);
    if (!refreshedDetail) throw new Error("INSPECTION_ITEM_NOT_FOUND");
    return refreshedDetail;
  }
}

function isProjectAllowed(projectId: string, allowedProjectIds?: string[]): boolean {
  if (!allowedProjectIds) {
    return true;
  }

  return allowedProjectIds.includes(projectId);
}

function isProjectVisible(
  projectId: string,
  allowedProjectIds?: string[],
  scopedProjectId?: string
): boolean {
  if (!isProjectAllowed(projectId, allowedProjectIds)) {
    return false;
  }

  if (scopedProjectId && projectId !== scopedProjectId) {
    return false;
  }

  return true;
}

function createCommentRecord(input: {
  inspectionItemId: string;
  roundId: string;
  authorId: string;
  content: string;
  now: string;
  localId: number;
  suffix: string;
}): CommentRecord {
  return {
    id: `${input.inspectionItemId}-comment-${input.roundId}-${input.localId}`,
    inspectionItemId: input.inspectionItemId,
    createdInRoundId: input.roundId,
    closedInRoundId: null,
    authorId: input.authorId,
    localId: input.localId,
    content: input.content,
    status: "open",
    closedBy: null,
    closedAt: null,
    resolveRemark: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function createSubmissionDetail(input: {
  item: InspectionItemRecord;
  currentRound: InspectionRoundRecord;
  openCommentCount: number;
  totalCommentCount: number;
}): InspectionItemDetailResponse {
  const state = resolveInspectionItemState({
    latestSubmittedResult: input.item.lastRoundResult,
    openCommentCount: input.openCommentCount,
    totalCommentCount: input.totalCommentCount
  });

  return {
    id: input.item.id,
    projectCode: "",
    projectName: "",
    projectOwner: null,
    projectShipyard: null,
    projectClass: null,
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
      localId: index + 1,
      roundNumber: input.item.currentRound,
      status: "open",
      message: "",
      createdAt: "",
      createdBy: "",
      resolvedAt: null,
      resolvedBy: null,
      resolveRemark: null
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

function mapInspectionListItemRecord(record: {
  item: InspectionItemRecord;
  ship: { hullNumber: string; shipName: string };
  project: { code: string; name: string; owner: string | null; shipyard: string | null; class: string | null };
  currentRound: InspectionRoundRecord;
}): InspectionListItem {
  return {
    id: record.item.id,
    projectCode: record.project.code,
    projectName: record.project.name,
    projectOwner: record.project.owner,
    projectShipyard: record.project.shipyard,
    projectClass: record.project.class,
    hullNumber: record.ship.hullNumber,
    shipName: record.ship.shipName,
    itemName: record.item.itemName,
    discipline: record.item.discipline,
    plannedDate: record.currentRound.plannedDate ?? "",
    yardQc: record.currentRound.yardQc ?? "",
    currentResult: record.item.resolvedResult ?? record.item.lastRoundResult,
    workflowStatus: record.item.workflowStatus,
    openComments: record.item.openCommentsCount,
    currentRound: record.item.currentRound
  };
}

function createDashboardSummary(items: InspectionListItem[]): DashboardSnapshot["summary"] {
  return {
    pendingToday: items.filter((item) => item.workflowStatus === "pending").length,
    completedToday: items.filter((item) => item.currentResult === "AA").length,
    openComments: items.reduce((count, item) => count + item.openComments, 0),
    reinspectionQueue: items.filter((item) => item.currentResult === "OWC").length,
    projectProgress: 0
  };
}
