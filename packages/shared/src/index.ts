import type {
  InspectionItemComment,
  InspectionItemDetailResponse,
  InspectionRoundHistoryEntry
} from "./inspection-detail";

export * from "./ncr.ts";

export const DISCIPLINES = [
  "HULL",
  "PAINT",
  "MACH",
  "ELEC",
  "OUTFIT",
  "HSE",
  "SEC",
  "DOC",
  "CHS",
  "CCS",
  "PIPE"
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  HULL: "HULL",
  PAINT: "PAINT",
  MACH: "MACH",
  ELEC: "ELEC",
  OUTFIT: "OUTFIT",
  HSE: "HSE",
  SEC: "SEC",
  DOC: "DOC",
  CHS: "CHS",
  CCS: "CCS",
  PIPE: "PIPE"
};

export const INSPECTION_RESULTS = ["CX", "AA", "QCC", "OWC", "RJ"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  CX: "CX",
  AA: "AA",
  QCC: "QCC",
  OWC: "OWC",
  RJ: "RJ"
};

export const WORKFLOW_STATUSES = [
  "pending",
  "open",
  "closed",
  "cancelled"
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const ROLES = ["admin", "manager", "reviewer", "inspector"] as const;
export type Role = (typeof ROLES)[number];

export interface InspectionListItem {
  id: string;
  projectCode: string;
  projectName: string;
  projectOwner: string | null;
  projectShipyard: string | null;
  projectClass: string | null;
  hullNumber: string;
  shipName: string;
  itemName: string;
  discipline: Discipline;
  plannedDate: string;
  yardQc: string;
  currentResult: InspectionResult | null;
  workflowStatus: WorkflowStatus;
  openComments: number;
  currentRound: number;
}

export interface DashboardSummary {
  pendingToday: number;
  completedToday: number;
  openComments: number;
  reinspectionQueue: number;
  projectProgress: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  summary: DashboardSummary;
  items: InspectionListItem[];
}

// ---- 巡检/试航意见模块 DTO ----

/** 意见类型字典（用户可自定义扩展） */
export interface ObservationType {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 巡检/试航意见记录 */
export interface ObservationItem {
  id: string;
  shipId: string;
  hullNumber?: string; // 船号
  type: string;
  discipline: Discipline;
  authorId: string;
  authorName?: string;
  serialNo: number;
  location: string | null;
  date: string;
  content: string;
  remark: string | null;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Inspection Comments 聚合视图（只读） */
export interface InspectionCommentView {
  id: string;
  inspectionItemId: string;
  shipId: string;
  hullNumber: string;
  projectCode?: string;
  discipline: Discipline;
  inspectionItemName: string;
  roundNumber: number;
  localId: number;
  content: string;
  status: "open" | "closed";
  authorId: string;
  authorName: string;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  resolveRemark: string | null;
}

/** 预置的默认意见类型编码 */
export const DEFAULT_OBSERVATION_TYPES = [
  { code: "patrol", label: "Patrol" },
  { code: "sea_trial", label: "Sea Trial" },
  { code: "dock_trial", label: "Dock Trial" }
] as const;

export * from "./inspection-detail.ts";

function countOpenComments(comments: InspectionItemComment[]): number {
  return comments.filter((comment) => comment.status === "open").length;
}

export function syncListItemWithDetail(
  item: InspectionListItem,
  detail: InspectionItemDetailResponse
): InspectionListItem {
  return {
    ...item,
    currentResult: detail.resolvedResult ?? detail.lastRoundResult,
    workflowStatus: detail.workflowStatus,
    openComments: countOpenComments(detail.comments),
    currentRound: detail.currentRound
  };
}
