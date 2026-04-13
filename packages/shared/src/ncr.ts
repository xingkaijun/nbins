export interface NcrRelatedFile {
  id: string;
  name: string;
  objectKey: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface NcrPdfMeta {
  objectKey: string;
  generatedAt: string;
  version: number;
}

export interface NcrItemResponse {
  id: string;
  projectId: string;
  shipId: string;
  shipName?: string;
  projectName?: string;
  hullNumber?: string;
  title: string;
  discipline: string;
  serialNo: number;
  formattedSerial?: string;
  content: string;
  remark: string | null;
  authorId: string;
  authorName?: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  approvedBy: string | null;
  approvedByName?: string;
  approvedAt: string | null;
  closedBy: string | null;
  closedByName?: string;
  closedAt: string | null;
  imageAttachments: string[];
  attachments: string[]; // legacy alias for imageAttachments
  relatedFiles: NcrRelatedFile[];
  pdf: NcrPdfMeta | null;
  builderReply: string | null;
  replyDate: string | null;
  verifiedBy: string | null;
  verifyDate: string | null;
  rectifyRequest: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNcrRequest {
  shipId: string;
  title: string;
  discipline: string;
  serialNo: number;
  content: string;
  rectifyRequest?: string;
  remark?: string;
  imageAttachments?: string[];
}

export interface UpdateNcrRequest {
  title?: string;
  discipline?: string;
  content?: string;
  remark?: string | null;
  imageAttachments?: string[];
  builderReply?: string | null;
  replyDate?: string | null;
  verifiedBy?: string | null;
  verifyDate?: string | null;
  rectifyRequest?: string | null;
}

export interface CloseNcrRequest {
  closed: boolean;
}

export interface ApproveNcrRequest {
  approved: boolean;
}
