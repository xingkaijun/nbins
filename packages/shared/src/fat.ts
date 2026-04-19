export interface FatComment {
  id: string;
  content: string;
  status: "open" | "closed";
  closedBy?: string;
  closedAt?: string;
  createdAt: string;
}

export interface FatItemResponse {
  id: string;
  projectId: string;
  shipId: string;
  shipName?: string;
  projectName?: string;
  projectOwner?: string;
  projectShipyard?: string;
  hullNumber?: string;
  title: string;
  discipline: string;
  serialNo: number;
  formattedSerial?: string;
  content: string;
  result: string | null;
  comments: FatComment[];
  maker: string | null;
  authorId: string;
  authorName?: string;
  authorTitle?: string;
  imageAttachments: string[];
  inspectionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFatRequest {
  shipId: string;
  title: string;
  discipline: string;
  serialNo: number;
  content: string;
  result?: string;
  comments?: FatComment[];
  maker?: string;
  imageAttachments?: string[];
}

export interface UpdateFatRequest {
  title?: string;
  discipline?: string;
  content?: string;
  result?: string | null;
  comments?: FatComment[];
  maker?: string | null;
  inspectionDate?: string | null;
  imageAttachments?: string[];
}
