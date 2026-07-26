import type {
  DashboardSnapshot,
  Discipline,
  InspectionItemDetailResponse,
  InspectionCommentView,
  ResolveCommentRequest,
  ResolveCommentResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse,
} from "@nbins/shared";
import { requestJson, withQuery } from "./client";

export async function fetchInspectionDetail(
  inspectionItemId: string
): Promise<InspectionItemDetailResponse> {
  return requestJson<InspectionItemDetailResponse>(`/inspections/${inspectionItemId}`);
}

export async function fetchInspectionList(projectId?: string): Promise<DashboardSnapshot> {
  return requestJson<DashboardSnapshot>(withQuery("/inspections", { projectId }));
}

export async function submitInspectionResult(
  inspectionItemId: string,
  request: SubmitInspectionResultRequest
): Promise<SubmitInspectionResultResponse> {
  return requestJson<SubmitInspectionResultResponse>(
    `/inspections/${inspectionItemId}/rounds/current/result`,
    {
      method: "PUT",
      body: JSON.stringify(request)
    }
  );
}

export async function resolveInspectionComment(
  inspectionItemId: string,
  commentId: string,
  request: ResolveCommentRequest
): Promise<ResolveCommentResponse> {
  return requestJson<ResolveCommentResponse>(
    `/inspections/${inspectionItemId}/comments/${commentId}/resolve`,
    {
      method: "PUT",
      body: JSON.stringify(request)
    }
  );
}

export async function addInspectionCommentRemark(
  inspectionItemId: string,
  commentId: string,
  request: { expectedVersion: number; remark: string }
): Promise<ResolveCommentResponse> {
  return requestJson<ResolveCommentResponse>(
    `/inspections/${inspectionItemId}/comments/${commentId}/remark`,
    {
      method: "PUT",
      body: JSON.stringify(request)
    }
  );
}

export async function reopenInspectionComment(
  inspectionItemId: string,
  commentId: string,
  request: { expectedVersion: number }
): Promise<ResolveCommentResponse> {
  return requestJson<ResolveCommentResponse>(
    `/inspections/${inspectionItemId}/comments/${commentId}/reopen`,
    {
      method: "PUT",
      body: JSON.stringify(request)
    }
  );
}

export async function createInspectionCommentAdmin(
  inspectionItemId: string,
  data: {
    authorId: string;
    content: string;
  }
): Promise<{ id: string; localId: number; createdAt: string }> {
  return requestJson<{ id: string; localId: number; createdAt: string }>(
    `/inspections/${inspectionItemId}/comments/admin`,
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
}

export async function deleteInspectionCommentAdmin(
  inspectionItemId: string,
  commentId: string
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `/inspections/${inspectionItemId}/comments/${commentId}/admin`,
    {
      method: "DELETE"
    }
  );
}

export async function updateInspectionItemAdmin(
  inspectionItemId: string,
  data: {
    shipId?: string;
    itemName?: string;
    discipline?: Discipline;
    workflowStatus?: string;
    lastRoundResult?: string | null;
    resolvedResult?: string | null;
    currentRound?: number;
    source?: "manual" | "n8n";
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/inspections/${inspectionItemId}/admin/item`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteInspectionItem(
  inspectionItemId: string
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(`/inspections/${inspectionItemId}/admin`, {
    method: "DELETE"
  });
}

export async function updateInspectionCurrentRoundAdmin(
  inspectionItemId: string,
  data: {
    rawItemName?: string;
    plannedDate?: string | null;
    actualDate?: string | null;
    yardQc?: string | null;
    result?: string | null;
    inspectedBy?: string | null;
    notes?: string | null;
    source?: "manual" | "n8n";
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/inspections/${inspectionItemId}/admin/rounds/current`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function updateInspectionCommentAdmin(
  inspectionItemId: string,
  commentId: string,
  data: {
    authorId?: string;
    content?: string;
    status?: "open" | "closed";
    closedBy?: string | null;
    closedAt?: string | null;
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/inspections/${inspectionItemId}/comments/${commentId}/admin`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function batchImportInspections(payload: {
  projectId: string;
  shipId: string;
  items: Array<{
    itemName: string;
    discipline: string;
    plannedDate: string;
    yardQc: string;
    startAtRound: number;
    itpCode?: string;
  }>;
}): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>("/inspections/batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchInspectionComments(
  filters?: {
    projectId?: string;
    shipId?: string;
    discipline?: string;
    status?: string;
  }
): Promise<InspectionCommentView[]> {
  return requestJson<InspectionCommentView[]>(
    withQuery("/observations/inspection-comments", {
      projectId: filters?.projectId,
      shipId: filters?.shipId,
      discipline: filters?.discipline,
      status: filters?.status,
    })
  );
}
