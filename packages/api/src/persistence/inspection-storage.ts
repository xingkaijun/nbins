import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  ProjectRecord,
  ProjectMemberRecord,
  InspectionStorageSnapshot,
  ShipRecord,
  UserRecord
} from "./records.ts";

export interface SubmitCurrentRoundResultStorageMutation {
  inspectionItem: InspectionItemRecord;
  inspectionRound: InspectionRoundRecord;
  createdComments: CommentRecord[];
}

export interface ResolveCommentStorageMutation {
  inspectionItem: InspectionItemRecord;
  comment: CommentRecord;
}

export interface InspectionDetailStorageRecord {
  item: InspectionItemRecord;
  ship: ShipRecord;
  project: ProjectRecord;
  rounds: InspectionRoundRecord[];
  comments: CommentRecord[];
  users: UserRecord[];
}

export interface InspectionSubmissionContextRecord {
  item: InspectionItemRecord;
  currentRound: InspectionRoundRecord;
  openCommentCount: number;
}

export interface InspectionListStorageRecord {
  generatedAt: string;
  items: Array<{
    item: InspectionItemRecord;
    ship: ShipRecord;
    project: ProjectRecord;
    currentRound: InspectionRoundRecord;
  }>;
}

export interface InspectionStorage {
  read(): Promise<InspectionStorageSnapshot>;
  write(next: InspectionStorageSnapshot): Promise<void>;
  readUserById?(id: string): Promise<UserRecord | null>;
  readUserByUsername?(username: string): Promise<UserRecord | null>;
  readProjectMembersByUserId?(userId: string): Promise<ProjectMemberRecord[]>;
  readInspectionList?(): Promise<InspectionListStorageRecord>;
  readInspectionDetail?(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null>;
  readSubmittedInspectionDetail?(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null>;
  readSubmissionContext?(
    inspectionItemId: string
  ): Promise<InspectionSubmissionContextRecord | null>;
  submitCurrentRoundResult?(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void>;
  resolveComment?(mutation: ResolveCommentStorageMutation): Promise<void>;
  reset?(seed?: InspectionStorageSnapshot): Promise<void>;
}
