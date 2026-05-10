import { getAuthToken } from "../auth";
import { getApiBaseUrl } from "./client";

/** 
 * ----- SQL Console API -----
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeSql(sql: string, secret: string): Promise<any> {
  return sqlFetch("/sql/execute", secret, {
    method: "POST",
    body: JSON.stringify({ sql })
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportDatabase(secret: string): Promise<any> {
  return sqlFetch("/sql/export-db", secret, { method: "GET" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importDatabase(data: object, secret: string): Promise<any> {
  return sqlFetch("/sql/import-db", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportProject(projectId: string, secret: string): Promise<any> {
  return sqlFetch(`/sql/export-project/${projectId}`, secret, { method: "GET" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importProject(data: object, secret: string): Promise<any> {
  return sqlFetch("/sql/import-project", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteProject(projectId: string, secret: string): Promise<any> {
  return sqlFetch(`/sql/delete-project/${projectId}`, secret, { method: "DELETE" });
}
