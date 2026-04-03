import { INSPECTION_RESULTS, WORKFLOW_STATUSES } from "@nbins/shared";
import type { InspectionResult, WorkflowStatus } from "@nbins/shared";

export type ResolvedInspectionResult = InspectionResult | null;

export interface ResolveInspectionItemStateInput {
  latestSubmittedResult: InspectionResult | null;
  openCommentCount: number;
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

  const { latestSubmittedResult, openCommentCount } = input;
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
        resolvedResult: hasOpenComments ? null : "AA",
        lastRoundResult: latestSubmittedResult,
        openCommentCount,
        pendingFinalAcceptance: hasOpenComments,
        waitingForNextRound: false,
        autoClosedFromComments: !hasOpenComments
      });
    case "OWC":
    case "RJ":
      return buildState({
        workflowStatus: "open",
        resolvedResult: null,
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
    name: "AA closes immediately when no comments remain",
    input: { latestSubmittedResult: "AA", openCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "AA",
      openCommentCount: 0
    })
  },
  {
    name: "AA stays open when historical comments are still open",
    input: { latestSubmittedResult: "AA", openCommentCount: 2 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "AA",
      openCommentCount: 2
    })
  },
  {
    name: "QCC stays open without creating a new round",
    input: { latestSubmittedResult: "QCC", openCommentCount: 1 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "QCC",
      openCommentCount: 1
    })
  },
  {
    name: "QCC auto-resolves to AA after all comments close",
    input: { latestSubmittedResult: "QCC", openCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "QCC",
      openCommentCount: 0
    })
  },
  {
    name: "OWC remains open and waits for a future round",
    input: { latestSubmittedResult: "OWC", openCommentCount: 1 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 1
    })
  },
  {
    name: "RJ remains open and waits for a future round",
    input: { latestSubmittedResult: "RJ", openCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "RJ",
      openCommentCount: 0
    })
  },
  {
    name: "CX marks the item cancelled",
    input: { latestSubmittedResult: "CX", openCommentCount: 0 },
    expected: resolveInspectionItemState({
      latestSubmittedResult: "CX",
      openCommentCount: 0
    })
  }
];

export function listSupportedWorkflowStatuses(): readonly WorkflowStatus[] {
  return WORKFLOW_STATUSES;
}
