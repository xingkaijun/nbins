import type { Discipline, InspectionResult, WorkflowStatus } from "./index";

export const COMMENT_STATUSES = ["open", "closed"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface InspectionItemComment {
  id: string;
  localId: number;
  roundNumber: number;
  status: CommentStatus;
  message: string;
  createdAt: string;
  createdBy: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface InspectionRoundHistoryEntry {
  id: string;
  roundNumber: number;
  actualDate: string | null;
  submittedResult: InspectionResult | null;
  submittedAt: string;
  submittedBy: string;
  inspectorDisplayName: string;
  notes: string | null;
  source: "manual" | "n8n";
  commentIds: string[];
}

export interface InspectionItemDetailResponse {
  id: string;
  projectCode: string;
  projectName: string;
  hullNumber: string;
  shipName: string;
  itemName: string;
  discipline: Discipline;
  source: "manual" | "n8n";
  yardQc: string;
  plannedDate: string | null;
  actualDate: string | null;
  currentRound: number;
  currentRoundId: string;
  version: number;
  workflowStatus: WorkflowStatus;
  resolvedResult: InspectionResult | null;
  lastRoundResult: InspectionResult | null;
  openCommentCount: number;
  pendingFinalAcceptance: boolean;
  waitingForNextRound: boolean;
  comments: InspectionItemComment[];
  roundHistory: InspectionRoundHistoryEntry[];
}

export interface SubmitInspectionCommentInput {
  message: string;
}

export interface SubmitInspectionResultRequest {
  result: InspectionResult;
  actualDate: string | null;
  submittedAt?: string;
  submittedBy: string;
  inspectorDisplayName?: string;
  notes?: string | null;
  expectedVersion: number;
  comments?: SubmitInspectionCommentInput[];
}

export interface SubmitInspectionResultResponse {
  item: InspectionItemDetailResponse;
  createdRoundHistoryEntry: InspectionRoundHistoryEntry;
  createdComments: InspectionItemComment[];
}
