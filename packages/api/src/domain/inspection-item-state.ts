import { INSPECTION_RESULTS, WORKFLOW_STATUSES } from "@nbins/shared";
import type { InspectionResult, WorkflowStatus } from "@nbins/shared";

export type ResolvedInspectionResult = InspectionResult | null;

export interface ResolveInspectionItemStateInput {
  latestSubmittedResult: InspectionResult | null;
  openCommentCount: number;
  totalCommentCount: number;
}

export interface ResolveInspectionItemStateOutput {
  workflowStatus: WorkflowStatus;
  resolvedResult: ResolvedInspectionResult;
  lastRoundResult: InspectionResult | null;
  openCommentCount: number;
  pendingFinalAcceptance: boolean;
  waitingForNextRound: boolean;
  autoClosedFromComments: boolean;
}

export function assertValidInspectionItemStateInput(
  input: ResolveInspectionItemStateInput
): void {
  if (!Number.isInteger(input.openCommentCount) || input.openCommentCount < 0) {
    throw new Error("openCommentCount must be a non-negative integer");
  }

  if (!Number.isInteger(input.totalCommentCount) || input.totalCommentCount < 0) {
    throw new Error("totalCommentCount must be a non-negative integer");
  }

  if (input.openCommentCount > input.totalCommentCount) {
    throw new Error("openCommentCount cannot exceed totalCommentCount");
  }

  if (
    input.latestSubmittedResult !== null &&
    !INSPECTION_RESULTS.includes(input.latestSubmittedResult)
  ) {
    throw new Error("latestSubmittedResult is not a supported inspection result");
  }
}

export function resolveInspectionItemState(
  input: ResolveInspectionItemStateInput
): ResolveInspectionItemStateOutput {
  assertValidInspectionItemStateInput(input);

  const { latestSubmittedResult, openCommentCount, totalCommentCount } = input;
  const hasComments = totalCommentCount > 0;
  const hasOpenComments = openCommentCount > 0;

  if (latestSubmittedResult === null) {
    return buildState({
      workflowStatus: "pending",
      resolvedResult: null,
      lastRoundResult: null,
      openCommentCount,
      pendingFinalAcceptance: false,
      waitingForNextRound: false,
      autoClosedFromComments: false
    });
  }

  // User requirement: 
  // "有意见但是全都关闭了，强制resolved result变成AA结论" 
  // (If there are comments but they are all closed, force resolvedResult to AA)
  // "除非 CX" (except CX)
  if (hasComments && !hasOpenComments && latestSubmittedResult !== "CX") {
    return buildState({
      workflowStatus: "closed",
      resolvedResult: "AA",
      lastRoundResult: latestSubmittedResult,
      openCommentCount: 0,
      pendingFinalAcceptance: false,
      waitingForNextRound: false,
      autoClosedFromComments: latestSubmittedResult !== "AA"
    });
  }

  switch (latestSubmittedResult) {
    case "AA":
      return buildState({
        workflowStatus: hasOpenComments ? "open" : "closed",
        resolvedResult: hasOpenComments ? null : "AA",
        lastRoundResult: latestSubmittedResult,
        openCommentCount,
        pendingFinalAcceptance: hasOpenComments,
        waitingForNextRound: false,
        autoClosedFromComments: false
      });
    case "QCC":
      return buildState({
        workflowStatus: hasOpenComments ? "open" : "closed",
        // If there are NO comments (total = 0), "如果没有意见，那么resolved result就和result栏的选择一致"
        resolvedResult: hasComments ? null : "QCC",
        lastRoundResult: latestSubmittedResult,
        openCommentCount,
        pendingFinalAcceptance: hasOpenComments,
        waitingForNextRound: false,
        autoClosedFromComments: false
      });
    case "OWC":
    case "RJ":
      return buildState({
        workflowStatus: "open",
        resolvedResult: hasComments ? null : latestSubmittedResult,
        lastRoundResult: latestSubmittedResult,
        openCommentCount,
        pendingFinalAcceptance: false,
        waitingForNextRound: true,
        autoClosedFromComments: false
      });
    case "CX":
      return buildState({
        workflowStatus: "cancelled",
        resolvedResult: "CX",
        lastRoundResult: latestSubmittedResult,
        openCommentCount,
        pendingFinalAcceptance: false,
        waitingForNextRound: false,
        autoClosedFromComments: false
      });
    default:
      return assertUnreachable(latestSubmittedResult);
  }
}

function buildState(
  output: ResolveInspectionItemStateOutput
): ResolveInspectionItemStateOutput {
  return output;
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled inspection result: ${String(value)}`);
}

export const RESOLVE_ITEM_STATE_EXAMPLES: Array<{
  name: string;
  input: ResolveInspectionItemStateInput;
  expected: ResolveInspectionItemStateOutput;
}> = [
  {
    name: "AA closes immediately when no comments generated",
    input: { latestSubmittedResult: "AA", openCommentCount: 0, totalCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "AA",
      openCommentCount: 0,
      totalCommentCount: 0
    })
  },
  {
    name: "AA closes immediately when all comments closed",
    input: { latestSubmittedResult: "AA", openCommentCount: 0, totalCommentCount: 2 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "AA",
      openCommentCount: 0,
      totalCommentCount: 2
    })
  },
  {
    name: "AA stays open when historical comments are still open",
    input: { latestSubmittedResult: "AA", openCommentCount: 2, totalCommentCount: 2 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "AA",
      openCommentCount: 2,
      totalCommentCount: 2
    })
  },
  {
    name: "QCC matches result if no comments",
    input: { latestSubmittedResult: "QCC", openCommentCount: 0, totalCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "QCC",
      openCommentCount: 0,
      totalCommentCount: 0
    })
  },
  {
    name: "QCC auto-resolves to AA after all comments close",
    input: { latestSubmittedResult: "QCC", openCommentCount: 0, totalCommentCount: 1 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "QCC",
      openCommentCount: 0,
      totalCommentCount: 1
    })
  },
  {
    name: "OWC matches result if no comments",
    input: { latestSubmittedResult: "OWC", openCommentCount: 0, totalCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 0,
      totalCommentCount: 0
    })
  },
  {
    name: "OWC resolves to AA if it had comments but they closed",
    input: { latestSubmittedResult: "OWC", openCommentCount: 0, totalCommentCount: 1 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 0,
      totalCommentCount: 1
    })
  },
  {
    name: "RJ matches result if no comments",
    input: { latestSubmittedResult: "RJ", openCommentCount: 0, totalCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "RJ",
      openCommentCount: 0,
      totalCommentCount: 0
    })
  },
  {
    name: "CX marks the item cancelled regardless of comments",
    input: { latestSubmittedResult: "CX", openCommentCount: 0, totalCommentCount: 2 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "CX",
      openCommentCount: 0,
      totalCommentCount: 2
    })
  }
];

export function listSupportedWorkflowStatuses(): readonly WorkflowStatus[] {
  return WORKFLOW_STATUSES;
}
