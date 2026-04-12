import type {
  DashboardSnapshot,
  Discipline,
  InspectionCommentView,
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
import type { NcrItemResponse, CreateNcrRequest, ApproveNcrRequest } from "@nbins/shared";
import { clearAuthSession, getAuthToken, notifySessionExpired, type AuthUser } from "./auth";

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
  disciplines: string[];
  reportRecipients: string[];
  ncrRecipients: string[];
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

export interface LoginResponse {
  user: AuthUser;
  token: string;
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
  let baseUrl = configuredApiBaseUrl.trim();
  
  if (!baseUrl) {
    return DEFAULT_API_BASE_URL;
  }

  // 移除结尾的所有斜杠
  baseUrl = baseUrl.replace(/\/+$/, "");

  // 检查是否已经包含了 /api 后缀，如果没有则补上
  if (!baseUrl.endsWith("/api")) {
    baseUrl = `${baseUrl}/api`;
  }

  return baseUrl;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);

  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (response.status === 401 && token) {
    clearAuthSession();
    notifySessionExpired();
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
  const token = getAuthToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}/meta`, { headers });

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return (await response.json()) as ApiMeta;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: username.trim(),
      password
    })
  });
}

export function clearStoredAuth(): void {
  clearAuthSession();
}

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

export async function fetchProjects(status?: ProjectRecord["status"]): Promise<ProjectRecord[]> {
  return requestJson<ProjectRecord[]>(withQuery("/projects", { status }));
}

export async function createProject(data: {
  name: string;
  code: string;
  owner?: string;
  shipyard?: string;
  class?: string;
  disciplines?: string[];
  reportRecipients?: string[];
  ncrRecipients?: string[];
}): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>("/projects", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateProject(
  projectId: string,
  data: Partial<Pick<ProjectRecord, "name" | "code" | "status" | "owner" | "shipyard" | "class" | "disciplines" | "reportRecipients" | "ncrRecipients">>
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
  data: Partial<Pick<ShipRecord, "projectId" | "hullNumber" | "shipName" | "shipType" | "status">>
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
  data: Partial<Pick<UserRecord, "username" | "displayName" | "role" | "disciplines" | "accessibleProjectIds">> & {
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

export async function deleteUser(userId: string): Promise<void> {
  await requestJson<unknown>(`/users/${userId}`, { method: "DELETE" });
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
  }>;
}): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>("/inspections/batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type { InspectionListItem };

export async function fetchNcrs(shipId: string): Promise<NcrItemResponse[]> {
  return requestJson<NcrItemResponse[]>(`/ncrs/ships/${shipId}`);
}

export async function createNcr(shipId: string, data: CreateNcrRequest): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/ships/${shipId}`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function approveNcr(ncrId: string, data: ApproveNcrRequest): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}/approve`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

/** ----- SQL Console API -----
 * 独立的 fetch 封装，不走 requestJson 以避免触发全局 401 session 过期逻辑。
 * SQL 控制台用的是 X-SQL-Secret 而非 JWT，不应影响用户登录状态。
 */

async function sqlFetch<T>(path: string, secret: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-SQL-Secret", secret);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });

  let payload: { ok: boolean; data?: T; error?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `SQL request failed (${response.status})`);
  }

  return payload.data as T;
}

export async function executeSql(sql: string, secret: string) {
  return sqlFetch<any>("/sql/execute", secret, {
    method: "POST",
    body: JSON.stringify({ sql })
  });
}

export async function exportDatabase(secret: string) {
  return sqlFetch<any>("/sql/export-db", secret, { method: "GET" });
}

export async function importDatabase(data: object, secret: string) {
  return sqlFetch<any>("/sql/import-db", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

export async function exportProject(projectId: string, secret: string) {
  return sqlFetch<any>(`/sql/export-project/${projectId}`, secret, { method: "GET" });
}

export async function importProject(data: object, secret: string) {
  return sqlFetch<any>("/sql/import-project", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

export async function deleteProject(projectId: string, secret: string) {
  return sqlFetch<any>(`/sql/delete-project/${projectId}`, secret, { method: "DELETE" });
}
