import type {
  DashboardSnapshot,
  Discipline,
  InspectionItemDetailResponse,
  InspectionListItem,
  ObservationItem,
  ObservationType,
  ResolveCommentRequest,
  ResolveCommentResponse,
  Role,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ApiMeta {
  appName: string;
  environment: string;
  storageMode: "mock" | "d1";
  generatedAt: string;
  disciplines: string[];
  routes: string[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
  owner: string | null;
  shipyard: string | null;
  class: string | null;
  recipients: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipRecord {
  id: string;
  projectId: string;
  hullNumber: string;
  shipName: string;
  shipType: string | null;
  status: "building" | "delivered";
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disciplines: Discipline[];
  accessibleProjectIds: string[];
  isActive: 0 | 1;
  createdAt: string;
  updatedAt: string;
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

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export async function fetchApiMeta(): Promise<ApiMeta> {
  const response = await fetch(`${getApiBaseUrl()}/meta`);

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return (await response.json()) as ApiMeta;
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
  shipId: string,
  filters?: {
    type?: string;
    discipline?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  }
): Promise<ObservationItem[]> {
  return requestJson<ObservationItem[]>(
    withQuery(`/ships/${shipId}/observations`, {
      type: filters?.type,
      discipline: filters?.discipline,
      status: filters?.status,
      date_from: filters?.date_from,
      date_to: filters?.date_to
    })
  );
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

export async function updateObservation(
  observationId: string,
  data: {
    shipId?: string;
    type?: string;
    discipline?: string;
    authorId?: string;
    date?: string;
    content?: string;
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
  observationId: string,
  closedBy?: string
): Promise<{ id: string; status: string; closedBy: string; closedAt: string }> {
  return requestJson<{ id: string; status: string; closedBy: string; closedAt: string }>(
    `/observations/${observationId}/close`,
    {
      method: "PUT",
      body: JSON.stringify({ closedBy: closedBy ?? "sys-user" })
    }
  );
}

export async function fetchProjects(status?: ProjectRecord["status"]): Promise<ProjectRecord[]> {
  return requestJson<ProjectRecord[]>(withQuery("/projects", { status }));
}

export async function createProject(data: {
  name: string;
  code: string;
  owner?: string;
  shipyard?: string;
  class?: string;
  recipients?: string[];
}): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>("/projects", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateProject(
  projectId: string,
  data: Partial<Pick<ProjectRecord, "name" | "code" | "status" | "owner" | "shipyard" | "class" | "recipients">>
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function fetchShips(projectId?: string, status?: ShipRecord["status"]): Promise<ShipRecord[]> {
  return requestJson<ShipRecord[]>(withQuery("/ships", { projectId, status }));
}

export async function createShip(data: {
  projectId: string;
  hullNumber: string;
  shipName: string;
  shipType?: string;
}): Promise<ShipRecord> {
  return requestJson<ShipRecord>("/ships", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateShip(
  shipId: string,
  data: Partial<Pick<ShipRecord, "hullNumber" | "shipName" | "shipType" | "status">>
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/ships/${shipId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function fetchUsers(filters?: {
  role?: Role;
  isActive?: "true" | "false";
}): Promise<UserRecord[]> {
  return requestJson<UserRecord[]>(withQuery("/users", filters ?? {}));
}

export async function createUser(data: {
  username: string;
  displayName: string;
  password: string;
  role: Role;
  disciplines?: Discipline[];
  accessibleProjectIds?: string[];
}): Promise<UserRecord> {
  return requestJson<UserRecord>("/users", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateUser(
  userId: string,
  data: Partial<Pick<UserRecord, "displayName" | "role" | "disciplines" | "accessibleProjectIds">> & {
    isActive?: boolean;
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/users/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify({ password })
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
    isReinspection: boolean;
  }>;
}): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>("/inspections/batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type { InspectionListItem };
