import type { Discipline, InspectionResult, Role, WorkflowStatus } from "@nbins/shared";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  disciplines: Discipline[];
  accessibleProjectIds: string[];
  isActive: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  owner: string | null;
  shipyard: string | null;
  class: string | null;
  reportRecipients: string[];
  ncrRecipients: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipRecord {
  id: string;
  projectId: string;
  hullNumber: string;
  shipName: string;
  shipType: string | null;
  status: "building" | "delivered";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberRecord {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionItemRecord {
  id: string;
  shipId: string;
  itemName: string;
  itemNameNormalized: string;
  discipline: Discipline;
  workflowStatus: WorkflowStatus;
  lastRoundResult: InspectionResult | null;
  resolvedResult: InspectionResult | null;
  currentRound: number;
  openCommentsCount: number;
  version: number;
  source: "manual" | "n8n";
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRoundRecord {
  id: string;
  inspectionItemId: string;
  roundNumber: number;
  rawItemName: string;
  plannedDate: string | null;
  actualDate: string | null;
  yardQc: string | null;
  result: InspectionResult | null;
  inspectedBy: string | null;
  notes: string | null;
  source: "manual" | "n8n";
  createdAt: string;
  updatedAt: string;
}

export interface CommentRecord {
  id: string;
  inspectionItemId: string;
  createdInRoundId: string;
  closedInRoundId: string | null;
  authorId: string;
  localId: number;
  content: string;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  resolveRemark: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- 巡检/试航意见模块 ----

/** 意见类型字典表记录 (如巡检、试航、系泊试验等，用户可自定义) */
export interface ObservationTypeRecord {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 巡检/试航意见记录，挂在 Ship 维度下 */
export interface ObservationRecord {
  id: string;
  shipId: string;
  type: string;          // 关联 observation_types.code，不做外键强约束
  discipline: Discipline;
  authorId: string;
  date: string;
  content: string;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionStorageSnapshot {
  users: UserRecord[];
  projects: ProjectRecord[];
  projectMembers: ProjectMemberRecord[];
  ships: ShipRecord[];
  inspectionItems: InspectionItemRecord[];
  inspectionRounds: InspectionRoundRecord[];
  comments: CommentRecord[];
  observations: ObservationRecord[];
  ncrs: NcrRecord[];
}

export interface NcrRecord {
  id: string;
  shipId: string;
  title: string;
  content: string;
  authorId: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  attachments: string[]; // JSON array of urls
  createdAt: string;
  updatedAt: string;
}

export function cloneStorageSnapshot(snapshot: InspectionStorageSnapshot): InspectionStorageSnapshot {
  return JSON.parse(JSON.stringify(snapshot));
}
