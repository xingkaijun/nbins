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
  remark: string | null;
  maker: string | null;
  authorId: string;
  authorName?: string;
  authorTitle?: string;
  imageAttachments: string[];
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
  remark?: string;
  maker?: string;
  imageAttachments?: string[];
}

export interface UpdateFatRequest {
  title?: string;
  discipline?: string;
  content?: string;
  result?: string | null;
  remark?: string | null;
  maker?: string | null;
  imageAttachments?: string[];
}
