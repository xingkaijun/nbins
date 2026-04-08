import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  getSessionExpiredEventName,
  setAuthSession,
  type AuthUser
} from "./auth";

interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  session: AuthSession | null;
  login: (nextSession: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): AuthSession | null {
  const token = getAuthToken();
  const user = getAuthUser();

  if (!token || !user) {
    clearAuthSession();
    return null;
  }

  return { token, user };
}

function buildRedirectTarget(pathname: string, search: string, hash: string): string {
  const redirectTarget = `${pathname}${search}${hash}`;
  return redirectTarget === "/login" ? "/" : redirectTarget;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());

  useEffect(() => {
    function handleSessionExpired() {
      clearAuthSession();
      setSession(null);

      const redirect = buildRedirectTarget(location.pathname, location.search, location.hash);
      navigate(`/login?redirect=${encodeURIComponent(redirect)}&reason=session-expired`, {
        replace: true
      });
    }

    const eventName = getSessionExpiredEventName();
    window.addEventListener(eventName, handleSessionExpired);
    return () => window.removeEventListener(eventName, handleSessionExpired);
  }, [location.hash, location.pathname, location.search, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      login(nextSession) {
        setAuthSession(nextSession);
        setSession(nextSession);
      },
      logout() {
        clearAuthSession();
        setSession(null);
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}

export function ProtectedRoute() {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    const redirect = buildRedirectTarget(location.pathname, location.search, location.hash);
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return <Outlet />;
}
