import type { ObservationItem, ObservationType } from "@nbins/shared";
import { requestJson, withQuery } from "./client";

export async function fetchObservationTypes(): Promise<ObservationType[]> {
  return requestJson<ObservationType[]>("/observation-types");
}

export async function createObservationType(data: {
  code: string;
  label: string;
  sortOrder?: number;
}): Promise<ObservationType> {
  return requestJson<ObservationType>("/observation-types", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateObservationType(
  observationTypeId: string,
  data: { label?: string; sortOrder?: number }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/observation-types/${observationTypeId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function fetchObservations(
  filters?: {
    projectId?: string;
    shipId?: string;
    type?: string;
    discipline?: string;
    status?: string;
  }
): Promise<ObservationItem[]> {
  return requestJson<ObservationItem[]>(
    withQuery("/observations", {
      projectId: filters?.projectId,
      shipId: filters?.shipId,
      type: filters?.type,
      discipline: filters?.discipline,
      status: filters?.status,
    })
  );
}

export async function createObservation(
  shipId: string,
  data: { type: string; discipline: string; location?: string; date: string; content: string; remark?: string }
): Promise<ObservationItem> {
  return requestJson<ObservationItem>(`/ships/${shipId}/observations`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function batchImportObservations(
  shipId: string,
  data: {
    type: string;
    items: Array<{
      discipline: string;
      location?: string;
      date: string;
      content: string;
      remark?: string;
    }>;
  }
): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>(`/ships/${shipId}/observations/batch`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateObservation(
  observationId: string,
  data: {
    shipId?: string;
    type?: string;
    discipline?: string;
    location?: string | null;
    date?: string;
    content?: string;
    remark?: string | null;
    status?: "open" | "closed";
    closedBy?: string | null;
    closedAt?: string | null;
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/observations/${observationId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function closeObservation(
  observationId: string
): Promise<{ id: string; status: string; closedBy: string; closedAt: string }> {
  return requestJson<{ id: string; status: string; closedBy: string; closedAt: string }>(
    `/observations/${observationId}/close`,
    { method: "PUT", body: JSON.stringify({}) }
  );
}

export async function reopenObservation(
  observationId: string
): Promise<{ id: string; status: string }> {
  return requestJson<{ id: string; status: string }>(
    `/observations/${observationId}/reopen`,
    { method: "PUT", body: JSON.stringify({}) }
  );
}

export async function toggleObservationHighlight(
  observationId: string,
  isHighlighted: number
): Promise<{ id: string; isHighlighted: number }> {
  return requestJson<{ id: string; isHighlighted: number }>(
    `/observations/${observationId}/highlight`,
    { method: "PUT", body: JSON.stringify({ isHighlighted }) }
  );
}

export async function toggleCommentHighlight(
  inspectionItemId: string,
  commentId: string,
  isHighlighted: number
): Promise<{ id: string; isHighlighted: number }> {
  return requestJson<{ id: string; isHighlighted: number }>(
    `/inspections/${inspectionItemId}/comments/${commentId}/highlight`,
    { method: "PUT", body: JSON.stringify({ isHighlighted }) }
  );
}
