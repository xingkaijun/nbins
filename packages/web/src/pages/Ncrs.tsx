import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { NcrItemResponse } from "@nbins/shared";
import {
  approveNcr,
  createNcr,
  fetchNcrs,
  fetchProjects,
  fetchShips,
  type ProjectRecord,
  type ShipRecord
} from "../api";
import { resolveAvailableProjectId, useProjectContext } from "../project-context";

export function Ncrs() {
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [selectedShipId, setSelectedShipId] = useState("");
  const [items, setItems] = useState<NcrItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedShip = useMemo(
    () => ships.find((ship) => ship.id === selectedShipId) ?? null,
    [ships, selectedShipId]
  );

  useEffect(() => {
    let active = true;

    fetchProjects()
      .then((data) => {
        if (!active) {
          return;
        }

        setProjects(data);
        const nextProjectId = resolveAvailableProjectId(data, selectedProjectId);
        if (nextProjectId !== selectedProjectId) {
          setSelectedProjectId(nextProjectId);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    let active = true;

    if (!selectedProjectId) {
      setShips([]);
      setSelectedShipId("");
      return () => {
        active = false;
      };
    }

    setSelectedShipId("");
    fetchShips(selectedProjectId)
      .then((data) => {
        if (!active) {
          return;
        }

        setShips(data);
        setSelectedShipId(data[0]?.id ?? "");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setShips([]);
        setSelectedShipId("");
      });

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  const loadNcrs = useCallback(async () => {
    if (!selectedShipId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchNcrs(selectedShipId);
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load NCRs");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedShipId]);

  useEffect(() => {
    void loadNcrs();
  }, [loadNcrs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipId || !formTitle.trim() || !formContent.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await createNcr(selectedShipId, {
        shipId: selectedShipId,
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--nb-text)" }}>
            Non-Conformance Reports
          </h1>
          <p style={{ fontSize: 13, color: "var(--nb-text-muted)", margin: "4px 0 0" }}>
            NCR MANAGEMENT · {selectedProject ? `${selectedProject.name} (${selectedProject.code})` : "NO PROJECT SELECTED"}
            {selectedShip ? ` · Ship: ${selectedShip.shipName} (${selectedShip.hullNumber})` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="nb-btn nb-btn-primary"
            onClick={() => setShowForm(!showForm)}
            style={btnStyle("primary")}
            disabled={!selectedShipId}
          >
            + Create NCR
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={labelInlineStyle}>
          <span>Project</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={inputStyle}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.code})
              </option>
            ))}
          </select>
        </label>
        <label style={labelInlineStyle}>
          <span>Ship</span>
          <select
            value={selectedShipId}
            onChange={(e) => setSelectedShipId(e.target.value)}
            style={inputStyle}
            disabled={ships.length === 0}
          >
            {ships.length === 0 ? (
              <option value="">No ships in current project</option>
            ) : (
              ships.map((ship) => (
                <option key={ship.id} value={ship.id}>
                  {ship.shipName} ({ship.hullNumber})
                </option>
              ))
            )}
          </select>
        </label>
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
            <button type="submit" disabled={submitting || !selectedShipId} style={btnStyle("primary")}>
              {submitting ? "Submitting..." : "Submit NCR"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={btnStyle("secondary")}>Cancel</button>
          </div>
        </form>
      )}

      {!selectedProjectId ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 15 }}>Please select a project in Hall first.</p>
        </div>
      ) : loading ? (
        <p style={{ color: "var(--nb-text-muted)", textAlign: "center", padding: 40 }}>Loading NCRs...</p>
      ) : error ? (
        <p style={{ color: "#ef4444", textAlign: "center", padding: 40 }}>{error}</p>
      ) : !selectedShipId ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 15 }}>No ships found in the current project.</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--nb-text-muted)" }}>
          <p style={{ fontSize: 15 }}>No NCRs found.</p>
          <p style={{ fontSize: 13 }}>Click "+ Create NCR" to add a new record for the current ship.</p>
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

const labelInlineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--nb-text-muted)",
  fontWeight: 600
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
    color,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const
  };
}
