import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  InspectionStorageSnapshot
} from "./records.ts";

export interface SubmitCurrentRoundResultStorageMutation {
  inspectionItem: InspectionItemRecord;
  inspectionRound: InspectionRoundRecord;
  createdComments: CommentRecord[];
}

export interface InspectionStorage {
  read(): Promise<InspectionStorageSnapshot>;
  write(next: InspectionStorageSnapshot): Promise<void>;
  submitCurrentRoundResult?(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void>;
  reset?(seed?: InspectionStorageSnapshot): Promise<void>;
}
