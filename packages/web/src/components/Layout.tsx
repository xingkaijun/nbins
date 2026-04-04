import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  clearAuthSession,
  consumeAuthRedirectReason,
  setAuthSession,
  useAuthSession
} from "../auth";
import { ApiError, fetchCurrentUser } from "../api";
import { TopBar } from "./TopBar";

export function Layout() {
  const location = useLocation();
  const session = useAuthSession();
  const [validatingSession, setValidatingSession] = useState(true);

  useEffect(() => {
    let active = true;

    async function validateSession(): Promise<void> {
      if (!session?.token) {
        setValidatingSession(false);
        return;
      }

      setValidatingSession(true);

      try {
        const user = await fetchCurrentUser();
        if (!active) {
          return;
        }
        setAuthSession({
          token: session.token,
          user
        });
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          clearAuthSession();
        }
      } finally {
        if (active) {
          setValidatingSession(false);
        }
      }
    }

    void validateSession();

    return () => {
      active = false;
    };
  }, [session?.token]);

  if (!session?.token) {
    const reason = consumeAuthRedirectReason();

    return (
      <Navigate
        to="/login"
        replace
        state={reason ? { from: location, reason } : { from: location }}
      />
    );
  }

  if (validatingSession) {
    return (
      <div className="shell">
        <main className="workspace">
          <div className="alert neutral">Restoring session...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <TopBar />
      <Outlet />
    </div>
  );
}
