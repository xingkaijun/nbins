import { useSyncExternalStore } from "react";
import type { Discipline, Role } from "@nbins/shared";

const STORAGE_KEY = "nbins.auth.session";
const AUTH_EVENT = "nbins:auth-change";
const REDIRECT_REASON_KEY = "nbins.auth.redirect-reason";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disciplines: Discipline[];
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

type AuthListener = () => void;

const listeners = new Set<AuthListener>();

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function emitAuthChange(): void {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function getAuthSession(): AuthSession | null {
  return readStoredSession();
}

export function getAuthToken(): string | null {
  return readStoredSession()?.token ?? null;
}

export function setAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  emitAuthChange();
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  emitAuthChange();
}

export function setAuthRedirectReason(reason: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(REDIRECT_REASON_KEY, reason);
}

export function consumeAuthRedirectReason(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const reason = window.sessionStorage.getItem(REDIRECT_REASON_KEY);
  if (!reason) {
    return null;
  }

  window.sessionStorage.removeItem(REDIRECT_REASON_KEY);
  return reason;
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);

  function handleStorage(event: StorageEvent): void {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  }

  function handleAuthEvent(): void {
    listener();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_EVENT, handleAuthEvent);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_EVENT, handleAuthEvent);
    }
  };
}

export function useAuthSession(): AuthSession | null {
  return useSyncExternalStore(subscribeAuth, getAuthSession, () => null);
}
