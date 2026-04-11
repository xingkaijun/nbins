import {
  INSPECTION_RESULTS,
  type InspectionItemComment,
  type InspectionItemDetailResponse,
  type InspectionResult,
  type InspectionRoundHistoryEntry,
  type SubmitInspectionCommentInput,
  type SubmitInspectionResultRequest
} from "@nbins/shared";
import { resolveInspectionItemState } from "./inspection-item-state.ts";

export interface ApplyInspectionResultSubmissionInput {
  item: InspectionItemDetailResponse;
  submission: SubmitInspectionResultRequest;
}

export interface ApplyInspectionResultSubmissionOutput {
  item: InspectionItemDetailResponse;
  createdRoundHistoryEntry: InspectionRoundHistoryEntry;
  createdComments: InspectionItemComment[];
}

export function applyInspectionResultSubmission(
  input: ApplyInspectionResultSubmissionInput
): ApplyInspectionResultSubmissionOutput {
  assertValidSubmissionInput(input);

  const { item, submission } = input;
  const submittedComments = submission.comments ?? [];
  const submittedAt = submission.submittedAt as string;

  if (submission.result === "AA" && submittedComments.length > 0) {
    throw new Error("AA submissions cannot introduce new open comments");
  }

  const createdComments = submittedComments.map((comment, index) =>
    buildComment({
      itemId: item.id,
      roundNumber: item.currentRound,
      comment,
      submittedAt,
      submittedBy: submission.submittedBy,
      index: item.comments.length + index
    })
  );

  const allComments = [...item.comments, ...createdComments];
  const openCommentCount = countOpenComments(allComments);
  const nextState = resolveInspectionItemState({
    latestSubmittedResult: submission.result,
    openCommentCount,
    totalCommentCount: allComments.length
  });

  const createdRoundHistoryEntry: InspectionRoundHistoryEntry = {
    id: `${item.id}-round-${item.roundHistory.length + 1}`,
    roundNumber: item.currentRound,
    actualDate: submission.actualDate,
    submittedResult: submission.result,
    submittedAt,
    submittedBy: submission.submittedBy,
    inspectorDisplayName: submission.inspectorDisplayName ?? submission.submittedBy,
    notes: submission.notes ?? null,
    source: item.source,
    commentIds: createdComments.map((comment) => comment.id)
  };

  return {
    item: {
      ...item,
      workflowStatus: nextState.workflowStatus,
      resolvedResult: nextState.resolvedResult,
      lastRoundResult: nextState.lastRoundResult,
      openCommentCount: nextState.openCommentCount,
      pendingFinalAcceptance: nextState.pendingFinalAcceptance,
      waitingForNextRound: nextState.waitingForNextRound,
      comments: allComments,
      roundHistory: [...item.roundHistory, createdRoundHistoryEntry]
    },
    createdRoundHistoryEntry,
    createdComments
  };
}

function assertValidSubmissionInput(
  input: ApplyInspectionResultSubmissionInput
): void {
  if (!INSPECTION_RESULTS.includes(input.submission.result)) {
    throw new Error("submission.result is not a supported inspection result");
  }

  if (!input.submission.submittedAt) {
    throw new Error("submission.submittedAt is required");
  }

  if (!input.submission.submittedBy.trim()) {
    throw new Error("submission.submittedBy is required");
  }

  if (!Number.isInteger(input.submission.expectedVersion) || input.submission.expectedVersion < 1) {
    throw new Error("submission.expectedVersion must be a positive integer");
  }

  if (!Number.isInteger(input.item.currentRound) || input.item.currentRound < 1) {
    throw new Error("item.currentRound must be a positive integer");
  }

  for (const comment of input.submission.comments ?? []) {
    assertValidComment(comment);
  }
}

function assertValidComment(comment: SubmitInspectionCommentInput): void {
  if (!comment.message.trim()) {
    throw new Error("submission comments must include a non-empty message");
  }
}

function buildComment(input: {
  itemId: string;
  roundNumber: number;
  comment: SubmitInspectionCommentInput;
  submittedAt: string;
  submittedBy: string;
  index: number;
}): InspectionItemComment {
  return {
    id: `${input.itemId}-comment-${input.roundNumber}-${input.index + 1}`,
    localId: input.index + 1,
    roundNumber: input.roundNumber,
    status: "open",
    message: input.comment.message,
    createdAt: input.submittedAt,
    createdBy: input.submittedBy,
    resolvedAt: null,
    resolvedBy: null,
    resolveRemark: null
  };
}

function countOpenComments(comments: InspectionItemComment[]): number {
  return comments.filter((comment) => comment.status === "open").length;
}

export const APPLY_SUBMISSION_EXAMPLES: Array<{
  name: string;
  input: ApplyInspectionResultSubmissionInput;
  expected:
    | {
        ok: true;
        output: ApplyInspectionResultSubmissionOutput;
      }
    | {
        ok: false;
        error: string;
      };
}> = [
  createExample({
    name: "AA with no comments closes the item",
    item: createDemoItem(),
    submission: {
      result: "AA",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-a",
      inspectorDisplayName: "Inspector A",
      expectedVersion: 1
    }
  }),
  createExample({
    name: "AA with historical open comments stays open",
    item: createDemoItem({
      comments: [
        createExistingComment({
          id: "existing-open-comment",
          roundNumber: 1,
          message: "Seal gap remains visible"
        })
      ]
    }),
    submission: {
      result: "AA",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-a",
      inspectorDisplayName: "Inspector A",
      expectedVersion: 1
    }
  }),
  createExample({
    name: "Invalid AA with new comments is rejected",
    item: createDemoItem(),
    submission: {
      result: "AA",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-a",
      inspectorDisplayName: "Inspector A",
      expectedVersion: 1,
      comments: [{ message: "Need one more touch-up" }]
    }
  }),
  createExample({
    name: "QCC with comments stays in current round",
    item: createDemoItem(),
    submission: {
      result: "QCC",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-b",
      inspectorDisplayName: "Inspector B",
      expectedVersion: 1,
      comments: [{ message: "Mark pipe support orientation" }]
    }
  }),
  createExample({
    name: "OWC with comments waits for the next round",
    item: createDemoItem(),
    submission: {
      result: "OWC",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-c",
      inspectorDisplayName: "Inspector C",
      expectedVersion: 1,
      comments: [{ message: "Reinspect after welding repair" }]
    }
  }),
  createExample({
    name: "RJ without comments still waits for the next round",
    item: createDemoItem(),
    submission: {
      result: "RJ",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-d",
      inspectorDisplayName: "Inspector D",
      expectedVersion: 1
    }
  }),
  createExample({
    name: "RJ with comments keeps the item open",
    item: createDemoItem(),
    submission: {
      result: "RJ",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-d",
      inspectorDisplayName: "Inspector D",
      expectedVersion: 1,
      comments: [{ message: "Alignment out of tolerance" }]
    }
  }),
  createExample({
    name: "CX cancels the item",
    item: createDemoItem(),
    submission: {
      result: "CX",
      actualDate: (new Date().toLocaleDateString("en-CA")),
      submittedAt: "2026-04-03T10:00:00.000Z",
      submittedBy: "inspector-e",
      inspectorDisplayName: "Inspector E",
      expectedVersion: 1
    }
  })
];

function createExample(input: {
  name: string;
  item: InspectionItemDetailResponse;
  submission: SubmitInspectionResultRequest;
}): {
  name: string;
  input: ApplyInspectionResultSubmissionInput;
  expected:
    | {
        ok: true;
        output: ApplyInspectionResultSubmissionOutput;
      }
    | {
        ok: false;
        error: string;
      };
} {
  const fullInput = {
    item: input.item,
    submission: input.submission
  };

  try {
    return {
      name: input.name,
      input: fullInput,
      expected: {
        ok: true,
        output: applyInspectionResultSubmission(fullInput)
      }
    };
  } catch (error) {
    return {
      name: input.name,
      input: fullInput,
      expected: {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    };
  }
}

function createDemoItem(
  overrides: Partial<InspectionItemDetailResponse> = {}
): InspectionItemDetailResponse {
  const comments = overrides.comments ?? [];

  return {
    id: "insp-demo-001",
    projectCode: "P-001",
    projectName: "Hudong LNG Carrier",
    projectOwner: null,
    projectShipyard: null,
    projectClass: null,
    hullNumber: "H-2748",
    shipName: "NB2748",
    itemName: "Main Engine Alignment",
    discipline: "MACHINERY",
    source: "manual",
    yardQc: "Zhang San",
    plannedDate: (new Date().toLocaleDateString("en-CA")),
    actualDate: null,
    currentRound: 1,
    currentRoundId: "round-insp-demo-001-r1",
    version: 1,
    workflowStatus: "pending",
    resolvedResult: null,
    lastRoundResult: null,
    openCommentCount: countOpenComments(comments),
    pendingFinalAcceptance: false,
    waitingForNextRound: false,
    comments,
    roundHistory: overrides.roundHistory ?? [],
    ...overrides
  };
}

function createExistingComment(input: {
  id: string;
  roundNumber: number;
  message: string;
}): InspectionItemComment {
  return {
    id: input.id,
    localId: 1,
    roundNumber: input.roundNumber,
    status: "open",
    message: input.message,
    createdAt: "2026-04-02T09:00:00.000Z",
    createdBy: "Inspector Z",
    resolvedAt: null,
    resolvedBy: null,
    resolveRemark: null
  };
}
