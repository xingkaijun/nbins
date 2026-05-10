/**
 * Core HTTP client utilities for the NBINS frontend API layer.
 * All domain-specific API modules import from this file.
 */
import { clearAuthSession, getAuthToken, notifySessionExpired } from "../auth";

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

export function getApiBaseUrl(): string {
  let baseUrl = configuredApiBaseUrl.trim();
  
  if (!baseUrl) {
    return DEFAULT_API_BASE_URL;
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  if (!baseUrl.endsWith("/api")) {
    baseUrl = `${baseUrl}/api`;
  }

  return baseUrl;
}

export async function authorizedRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!isFormData && init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && token) {
    clearAuthSession();
    notifySessionExpired();
  }

  return response;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedRequest(path, init);

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

export async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const response = await authorizedRequest(path, init);
  if (!response.ok) {
    let payload: ApiEnvelope<unknown> | null = null;
    try {
      payload = (await response.json()) as ApiEnvelope<unknown>;
    } catch {
      payload = null;
    }

    throw new ApiError(payload?.error ?? `Request failed with status ${response.status}`, response.status);
  }

  return response.blob();
}

export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
