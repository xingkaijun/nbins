import type {
  InspectionItemDetailResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse,
  DashboardSnapshot,
  ObservationType,
  ObservationItem
} from "@nbins/shared";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DEFAULT_API_BASE_URL = "/api";
const configuredApiBaseUrl =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  typeof import.meta.env.VITE_NBINS_API_BASE_URL === "string"
    ? import.meta.env.VITE_NBINS_API_BASE_URL.trim()
    : "";

function getApiBaseUrl(): string {
  return configuredApiBaseUrl || DEFAULT_API_BASE_URL;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status
    );
  }

  return payload.data;
}

export async function fetchInspectionDetail(
  inspectionItemId: string
): Promise<InspectionItemDetailResponse> {
  return requestJson<InspectionItemDetailResponse>(`/inspections/${inspectionItemId}`);
}

export async function fetchInspectionList(): Promise<DashboardSnapshot> {
  return requestJson<DashboardSnapshot>("/inspections");
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

// ---- 巡检/试航意见模块 ----

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

export async function fetchObservations(
  shipId: string,
  filters?: { type?: string; discipline?: string; status?: string; date_from?: string; date_to?: string }
): Promise<ObservationItem[]> {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.discipline) params.set("discipline", filters.discipline);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  const qs = params.toString();
  return requestJson<ObservationItem[]>(`/ships/${shipId}/observations${qs ? `?${qs}` : ""}`);
}

export async function createObservation(
  shipId: string,
  data: { type: string; discipline: string; authorId: string; date: string; content: string }
): Promise<ObservationItem> {
  return requestJson<ObservationItem>(`/ships/${shipId}/observations`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function closeObservation(
  observationId: string,
  closedBy?: string
): Promise<{ id: string; status: string }> {
  return requestJson<{ id: string; status: string }>(`/observations/${observationId}/close`, {
    method: "PUT",
    body: JSON.stringify({ closedBy: closedBy ?? "sys-user" })
  });
}

// ---- Projects, Ships, & Import ----

export async function fetchProjects(): Promise<any[]> {
  return requestJson<any[]>("/projects");
}

export async function fetchShips(projectId?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId); // 目前后端没有做 query 支持，前端通过全量获取来过滤
  return requestJson<any[]>("/ships");
}

export async function batchImportInspections(payload: {
  projectId: string;
  shipId: string;
  items: Array<{
    itemName: string;
    discipline: string;
    plannedDate: string;
    yardQc: string;
    isReinspection: boolean;
  }>;
}): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>("/inspections/batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
