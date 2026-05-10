import { clearAuthSession } from "../auth";
import { ApiError, getApiBaseUrl, requestJson } from "./client";
import type { ApiMeta, LoginResponse } from "./types";

export async function fetchApiMeta(): Promise<ApiMeta> {
  const { getAuthToken } = await import("../auth");
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

export async function changePasswordPublic(
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      username: username.trim(),
      oldPassword,
      newPassword
    })
  });
}

export function clearStoredAuth(): void {
  clearAuthSession();
}
