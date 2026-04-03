import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  ProjectRecord,
  InspectionStorageSnapshot,
  ShipRecord,
  UserRecord
} from "./records.ts";

export interface SubmitCurrentRoundResultStorageMutation {
  inspectionItem: InspectionItemRecord;
  inspectionRound: InspectionRoundRecord;
  createdComments: CommentRecord[];
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

export interface InspectionStorage {
  read(): Promise<InspectionStorageSnapshot>;
  write(next: InspectionStorageSnapshot): Promise<void>;
  readInspectionDetail?(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null>;
  readSubmissionContext?(
    inspectionItemId: string
  ): Promise<InspectionSubmissionContextRecord | null>;
  submitCurrentRoundResult?(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void>;
  reset?(seed?: InspectionStorageSnapshot): Promise<void>;
}
