import type { Discipline, InspectionResult, Role, WorkflowStatus } from "@nbins/shared";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  disciplines: Discipline[];
  isActive: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  recipients: string[];
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
  ships: ShipRecord[];
  inspectionItems: InspectionItemRecord[];
  inspectionRounds: InspectionRoundRecord[];
  comments: CommentRecord[];
}
