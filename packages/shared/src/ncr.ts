export interface NcrItemResponse {
  id: string;
  shipId: string;
  title: string;
  content: string;
  authorId: string;
  authorName?: string; // Hydrated by API
  status: "draft" | "pending_approval" | "approved" | "rejected";
  approvedBy: string | null;
  approvedByName?: string; // Hydrated by API
  approvedAt: string | null;
  attachments: string[]; // JSON array of urls
  createdAt: string;
  updatedAt: string;
}

export interface CreateNcrRequest {
  shipId: string;
  title: string;
  content: string;
}

export interface ApproveNcrRequest {
  approved: boolean; // true for approved, false for rejected
}
