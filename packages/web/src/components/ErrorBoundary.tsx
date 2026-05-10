import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px",
          backgroundColor: "#f8fafc",
          fontFamily: "var(--nb-font-sans)"
        }}>
          <div style={{
            maxWidth: "600px",
            backgroundColor: "white",
            padding: "32px",
            borderRadius: "12px",
            boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
            borderTop: "4px solid #ef4444"
          }}>
            <h1 style={{ color: "#0f172a", fontSize: "24px", marginBottom: "16px", fontWeight: 600 }}>
              Oops! Something went wrong.
            </h1>
            <p style={{ color: "#475569", marginBottom: "24px", lineHeight: 1.6 }}>
              We're sorry, but an unexpected error occurred in the application.
              Our team has been notified, but you can try refreshing the page to see if that resolves the issue.
            </p>
            
            <div style={{ backgroundColor: "#f1f5f9", padding: "16px", borderRadius: "8px", overflow: "auto", marginBottom: "24px" }}>
              <code style={{ fontSize: "12px", color: "#ef4444", fontFamily: "monospace" }}>
                {this.state.error?.message || "Unknown error"}
              </code>
            </div>

            <button 
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
                transition: "background-color 0.2s"
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#1d4ed8"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
