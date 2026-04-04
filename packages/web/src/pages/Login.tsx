import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAuthSession, useAuthSession } from "../auth";
import { ApiError, login } from "../api";

interface LoginLocationState {
  from?: {
    pathname?: string;
    search?: string;
  };
  reason?: string;
}

export function Login() {
  const session = useAuthSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LoginLocationState | null;
  const redirectTo = locationState?.from?.pathname
    ? `${locationState.from.pathname}${locationState.from.search ?? ""}`
    : "/";
  const sessionExpired =
    locationState?.reason === "expired" ||
    new URLSearchParams(location.search).get("reason") === "expired";

  useEffect(() => {
    if (session?.token) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, session?.token]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim() || !password) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await login(username.trim(), password);
      setAuthSession({
        token: result.token,
        user: result.user
      });
      navigate(redirectTo, { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError("Invalid username or password.");
      } else if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Unable to sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      backgroundColor: "#f8fafc",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--nb-font)",
      backgroundImage: "radial-gradient(at center top, #e2e8f0 0%, #f8fafc 60%)"
    }}>
      <div style={{
        width: "420px",
        padding: "48px",
        background: "#fff",
        borderRadius: "24px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)",
        border: "1px solid rgba(148, 163, 184, 0.15)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <div style={{ 
          width: "64px", 
          height: "64px", 
          marginBottom: "24px", 
          background: "#fff", 
          padding: "8px", 
          borderRadius: "16px", 
          border: "1px solid rgba(148, 163, 184, 0.2)", 
          boxShadow: "0 4px 12px rgba(0,0,0,0.03)" 
        }}>
          <img src="https://i.postimg.cc/7LVr6n5m/PG-Logo.jpg" alt="PG Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        
        <h1 style={{ margin: "0 0 4px 0", fontSize: "22px", fontWeight: 800, color: "var(--nb-text)", letterSpacing: "-0.02em", textAlign: "center" }}>
          NEW BUILDING INSPECTION
        </h1>
        <p style={{ margin: "0 0 32px 0", fontSize: "13px", fontWeight: 600, color: "var(--nb-primary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Secure Authentication
        </p>

        {sessionExpired ? (
          <div className="alert neutral" style={{ width: "100%", margin: "0 0 16px 0" }}>
            Session expired. Please sign in again.
          </div>
        ) : null}

        <form onSubmit={(event) => void handleLogin(event)} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "var(--nb-text-muted)", marginBottom: "6px" }}>USERNAME / ID</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your inspector ID"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--nb-border)",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--nb-text)",
                backgroundColor: "#f8fafc",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--nb-primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--nb-border)"}
              disabled={submitting}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "var(--nb-text-muted)", marginBottom: "6px" }}>PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your security phrase"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--nb-border)",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--nb-text)",
                backgroundColor: "#f8fafc",
                boxSizing: "border-box",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--nb-primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--nb-border)"}
              disabled={submitting}
              required
            />
          </div>

          {error ? (
            <div className="alert error" style={{ margin: 0 }}>
              {error}
            </div>
          ) : null}
          
          <button 
            type="submit"
            disabled={submitting}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "14px",
              backgroundColor: "var(--nb-text)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              cursor: submitting ? "wait" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              transition: "background-color 0.2s ease",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              opacity: submitting ? 0.8 : 1
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--nb-primary)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "var(--nb-text)"}
          >
            {submitting ? "Authenticating..." : "Authenticate & Proceed"}
          </button>
        </form>

        <p style={{ marginTop: "32px", fontSize: "11px", fontWeight: 600, color: "#94a3b8", textAlign: "center" }}>
          Authorized classification society personnel only.<br/>
          All system interactions are monitored.
        </p>
      </div>
    </div>
  );
}
