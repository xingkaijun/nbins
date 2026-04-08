import React, { useEffect, useState, useCallback } from "react";
import type { NcrItemResponse, CreateNcrRequest, ApproveNcrRequest } from "@nbins/shared";
import { fetchNcrs, createNcr, approveNcr } from "../api";

const DEMO_SHIP_ID = "ship-h2748";

export function Ncrs() {
  const [items, setItems] = useState<NcrItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New NCR form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadNcrs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNcrs(DEMO_SHIP_ID);
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load NCRs");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNcrs();
  }, [loadNcrs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    try {
      await createNcr(DEMO_SHIP_ID, {
        shipId: DEMO_SHIP_ID,
        title: formTitle.trim(),
        content: formContent.trim()
      });
      setFormTitle("");
      setFormContent("");
      setShowForm(false);
      void loadNcrs();
    } catch (e: any) {
      alert("Failed to submit NCR: " + (e.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      await approveNcr(id, { approved });
      void loadNcrs();
    } catch (e: any) {
      alert("Failed to approve/reject: " + (e.message || "Unknown error"));
    }
  };

  return (
    <main className="ncrs-page" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--nb-text)" }}>
            Non-Conformance Reports
          </h1>
          <p style={{ fontSize: 13, color: "var(--nb-text-muted)", margin: "4px 0 0" }}>
            NCR MANAGEMENT · Ship: {DEMO_SHIP_ID}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="nb-btn nb-btn-primary"
            onClick={() => setShowForm(!showForm)}
            style={btnStyle("primary")}
          >
            + Create NCR
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={formBoxStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Create New NCR</h3>
          <label style={{ ...labelStyle, display: "block" }}>
            <span>Title</span>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Brief NCR Title"
              style={{ ...inputStyle, width: "100%" }}
              required
            />
          </label>
          <label style={{ ...labelStyle, marginTop: 12, display: "block" }}>
            <span>Content</span>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Detailed description of the non-conformance..."
              rows={4}
              style={{ ...inputStyle, resize: "vertical", width: "100%" }}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={submitting} style={btnStyle("primary")}>
              {submitting ? "Submitting..." : "Submit NCR"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={btnStyle("secondary")}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--nb-text-muted)", textAlign: "center", padding: 40 }}>Loading NCRs...</p>
      ) : error ? (
        <p style={{ color: "#ef4444", textAlign: "center", padding: 40 }}>{error}</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 15 }}>No NCRs found.</p>
          <p style={{ fontSize: 13 }}>Click "+ Create NCR" to add a new record.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--nb-surface)",
                border: "1px solid var(--nb-border)",
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={tagStyle(
                    item.status === "pending_approval" ? "#f59e0b" :
                    item.status === "approved" ? "#22c55e" :
                    item.status === "rejected" ? "#ef4444" : "#94a3b8"
                  )}>
                    {item.status.toUpperCase().replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--nb-text)" }}>{item.title}</span>
                  <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--nb-text)" }}>
                  {item.content}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--nb-text-muted)" }}>
                  Inspector: {item.authorName ?? item.authorId}
                  {item.approvedBy && ` · Handled by ${item.approvedByName ?? item.approvedBy} on ${new Date(item.approvedAt!).toLocaleDateString()}`}
                </p>
              </div>
              {item.status === "pending_approval" && (
                <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                  <button
                    onClick={() => handleApprove(item.id, true)}
                    style={{ ...btnStyle("primary"), fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApprove(item.id, false)}
                    style={{ ...btnStyle("secondary"), fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

// Helpers
function btnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "none",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s"
  };
  if (variant === "primary") {
    return { ...base, background: "var(--nb-accent, #0f766e)", color: "#fff" };
  }
  return {
    ...base,
    background: "var(--nb-surface, #f1f5f9)",
    color: "var(--nb-text, #334155)",
    border: "1px solid var(--nb-border, #e2e8f0)"
  };
}

const formBoxStyle: React.CSSProperties = {
  background: "var(--nb-surface)",
  border: "1px solid var(--nb-border)",
  borderRadius: 10,
  padding: "16px 20px",
  marginBottom: 16
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--nb-text-muted)",
  fontWeight: 500
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--nb-border, #e2e8f0)",
  fontSize: 13,
  background: "var(--nb-bg, #fff)",
  color: "var(--nb-text, #334155)"
};

function tagStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
    background: `${color}18`,
    color: color,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const
  };
}
