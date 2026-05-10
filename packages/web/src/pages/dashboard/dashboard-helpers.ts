import type {
  COMMENT_STATUSES,
  InspectionItemComment,
  InspectionItemDetailResponse,
  InspectionListItem,
  InspectionResult,
} from "@nbins/shared";
import { syncListItemWithDetail } from "@nbins/shared";

export const commentStatusLabels = {
  open: "Open",
  closed: "Closed"
} satisfies Record<(typeof COMMENT_STATUSES)[number], string>;

export function resultTone(result: InspectionResult | null): string {
  switch (result) {
    case "AA": return "result-aa";
    case "QCC": return "result-qcc";
    case "OWC": return "result-owc";
    case "RJ": return "result-rj";
    case "CX": return "result-cx";
    default: return "result-pending";
  }
}

export function formatStamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function buildCommentDrafts(commentText: string): Array<{ id: string; message: string }> {
  return commentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((message, index) => ({
      id: `draft-${index + 1}`,
      message
    }));
}

export function buildSubmissionPreview(
  detail: InspectionItemDetailResponse,
  selectedResult: InspectionResult,
  draftComments: Array<{ id: string; message: string }>
): {
  nextResult: InspectionResult | null;
  nextWorkflowLabel: string;
  nextOpenComments: number;
  nextPendingFinalAcceptance: boolean;
  nextWaitingForNextRound: boolean;
} {
  const existingOpenComments = detail.comments.filter((comment) => comment.status === "open").length;
  const addedOpenComments = selectedResult === "AA" || selectedResult === "CX" ? 0 : draftComments.length;
  const nextOpenComments = existingOpenComments + addedOpenComments;
  const totalComments = detail.comments.length + draftComments.length;

  if (totalComments > 0 && nextOpenComments === 0 && selectedResult !== "CX") {
    return {
      nextResult: "AA",
      nextWorkflowLabel: "Closed / accepted",
      nextOpenComments: 0,
      nextPendingFinalAcceptance: false,
      nextWaitingForNextRound: false
    };
  }

  switch (selectedResult) {
    case "AA":
      return {
        nextResult: nextOpenComments > 0 ? null : "AA",
        nextWorkflowLabel: nextOpenComments > 0 ? "Open / final acceptance pending" : "Closed / accepted",
        nextOpenComments,
        nextPendingFinalAcceptance: nextOpenComments > 0,
        nextWaitingForNextRound: false
      };
    case "QCC":
      return {
        nextResult: totalComments === 0 ? "QCC" : (nextOpenComments > 0 ? null : "AA"),
        nextWorkflowLabel: nextOpenComments > 0 ? "Open / comments to close" : "Closed / auto-accepted",
        nextOpenComments,
        nextPendingFinalAcceptance: nextOpenComments > 0,
        nextWaitingForNextRound: false
      };
    case "OWC":
      return {
        nextResult: totalComments === 0 ? "OWC" : null,
        nextWorkflowLabel: "Open / waiting next round",
        nextOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: true
      };
    case "RJ":
      return {
        nextResult: totalComments === 0 ? "RJ" : null,
        nextWorkflowLabel: "Open / rejected for reinspection",
        nextOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: true
      };
    case "CX":
      return {
        nextResult: "CX",
        nextWorkflowLabel: "Cancelled",
        nextOpenComments: existingOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: false
      };
  }
}

export function createSubmittedComments(
  detail: InspectionItemDetailResponse,
  submittedBy: string,
  submittedAt: string,
  draftComments: Array<{ id: string; message: string }>
): InspectionItemComment[] {
  const nextLocalId =
    Math.max(0, ...detail.comments.map((comment) => comment.localId ?? 0)) + 1;

  return draftComments.map((comment, index) => ({
    id: `${detail.id}-comment-${detail.currentRound}-${detail.comments.length + index + 1}`,
    localId: nextLocalId + index,
    roundNumber: detail.currentRound,
    status: "open",
    message: comment.message,
    createdAt: submittedAt,
    createdBy: submittedBy,
    resolvedAt: null,
    resolvedBy: null,
    resolveRemark: null
  }));
}

export function createLocalResolvedDetail(
  detail: InspectionItemDetailResponse,
  commentId: string,
  resolvedBy: string,
  remark?: string
): InspectionItemDetailResponse {
  const resolvedAt = new Date().toISOString();
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId && comment.status === "open"
      ? {
          ...comment,
          status: "closed" as const,
          resolvedAt,
          resolvedBy,
          resolveRemark: remark?.trim() || comment.resolveRemark
        }
      : comment
  );
  const nextOpenCommentCount = nextComments.filter((comment) => comment.status === "open").length;
  const totalComments = nextComments.length;
  
  // Rule: if total > 0 and open == 0, resolvedResult = AA
  const shouldBeAA = totalComments > 0 && nextOpenCommentCount === 0 && detail.lastRoundResult !== "CX";

  return {
    ...detail,
    comments: nextComments,
    openCommentCount: nextOpenCommentCount,
    workflowStatus: shouldBeAA
      ? "closed"
      : detail.resolvedResult === "CX"
        ? "cancelled"
        : (nextOpenCommentCount > 0 || detail.waitingForNextRound)
          ? "open"
          : detail.workflowStatus,
    resolvedResult: shouldBeAA ? "AA" : (totalComments === 0 ? detail.lastRoundResult : detail.resolvedResult),
    pendingFinalAcceptance: detail.lastRoundResult === "AA" ? nextOpenCommentCount > 0 : detail.pendingFinalAcceptance,
    version: detail.version + 1
  };
}

export function createLocalReopenedDetail(
  detail: InspectionItemDetailResponse,
  commentId: string
): InspectionItemDetailResponse {
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId && comment.status === "closed"
      ? {
          ...comment,
          status: "open" as const,
          resolvedAt: null,
          resolvedBy: null
        }
      : comment
  );
  const nextOpenCommentCount = nextComments.filter((comment) => comment.status === "open").length;

  return {
    ...detail,
    comments: nextComments,
    openCommentCount: nextOpenCommentCount,
    workflowStatus: "open",
    resolvedResult: null,
    version: detail.version + 1
  };
}

export function createLocalRemarkDetail(
  detail: InspectionItemDetailResponse,
  commentId: string,
  remark: string
): InspectionItemDetailResponse {
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId
      ? {
          ...comment,
          resolveRemark: remark.trim() || null
        }
      : comment
  );

  return {
    ...detail,
    comments: nextComments,
    version: detail.version + 1
  };
}

export function createLocalSubmissionDetail(input: {
  detail: InspectionItemDetailResponse;
  selectedResult: InspectionResult;
  preview: ReturnType<typeof buildSubmissionPreview>;
  canAddComments: boolean;
  draftComments: Array<{ id: string; message: string }>;
  submittedBy: string;
}): InspectionItemDetailResponse {
  const { detail, selectedResult, preview, canAddComments, draftComments, submittedBy } = input;
  const submittedAt = new Date().toISOString();
  const nextComments =
    canAddComments && draftComments.length > 0
      ? createSubmittedComments(detail, submittedBy, submittedAt, draftComments)
      : [];
  const localToday = new Date().toLocaleDateString("en-CA");
  const hasHistory = detail.roundHistory.length > 0;
  const lastEntryIndex = hasHistory ? detail.roundHistory.length - 1 : -1;
  const lastEntry = hasHistory ? detail.roundHistory[lastEntryIndex] : null;
  // 检查最后一轮提交是否发生在当日
  const lastEntryIsToday = lastEntry && (lastEntry.submittedAt.startsWith(localToday) || lastEntry.actualDate === localToday);

  let nextRoundHistory = [...detail.roundHistory];

  if (lastEntryIsToday) {
     nextRoundHistory[lastEntryIndex] = {
       ...lastEntry,
       submittedResult: selectedResult,
       submittedAt,
       commentIds: [...lastEntry.commentIds, ...nextComments.map((comment) => comment.id)]
     };
  } else {
     const nextHistoryEntry: InspectionItemDetailResponse["roundHistory"][number] = {
       id: `${detail.id}-round-${detail.currentRound}`,
       roundNumber: detail.currentRound,
       actualDate: detail.actualDate ?? localToday,
       submittedResult: selectedResult,
       submittedAt,
       submittedBy: submittedBy,
       inspectorDisplayName: submittedBy,
       notes: null,
       source: detail.source,
       commentIds: nextComments.map((comment) => comment.id)
     };
     nextRoundHistory.push(nextHistoryEntry);
  }

  return {
    ...detail,
    workflowStatus:
      selectedResult === "CX"
        ? "cancelled"
        : preview.nextResult === "AA" && !preview.nextPendingFinalAcceptance
          ? "closed"
          : preview.nextOpenComments > 0 || preview.nextWaitingForNextRound
            ? "open"
            : "pending",
    resolvedResult: preview.nextResult,
    lastRoundResult: selectedResult,
    openCommentCount: preview.nextOpenComments,
    pendingFinalAcceptance: preview.nextPendingFinalAcceptance,
    waitingForNextRound: preview.nextWaitingForNextRound,
    comments: [...detail.comments, ...nextComments],
    roundHistory: nextRoundHistory,
    version: detail.version + 1
  };
}

export function buildActualDate(detail: InspectionItemDetailResponse): string | null {
  return detail.actualDate ?? detail.plannedDate ?? null;
}

export function syncDashboardItem(
  listItems: InspectionListItem[],
  detail: InspectionItemDetailResponse
): InspectionListItem[] {
  return listItems.map((item) =>
    item.id === detail.id ? syncListItemWithDetail(item, detail) : item
  );
}
