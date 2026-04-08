import type { Discipline, Role } from "@nbins/shared";

const AUTH_TOKEN_STORAGE_KEY = "nbins.auth.token";
const AUTH_USER_STORAGE_KEY = "nbins.auth.user";
const SESSION_EXPIRED_EVENT = "nbins:session-expired";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disciplines: Discipline[];
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function getAuthToken(): string | null {
  return getStorage()?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? null;
}

export function getAuthUser(): AuthUser | null {
  const rawUser = getStorage()?.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function setAuthSession(session: { token: string; user: AuthUser }): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
  storage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(session.user));
}

export function clearAuthSession(): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  storage.removeItem(AUTH_USER_STORAGE_KEY);
}

export function getSessionExpiredEventName(): string {
  return SESSION_EXPIRED_EVENT;
}

export function notifySessionExpired(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}
