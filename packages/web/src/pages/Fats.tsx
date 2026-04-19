import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FatItemResponse } from "@nbins/shared";
import { DISCIPLINES } from "@nbins/shared";
import {
  createFat,
  deleteFat,
  fetchFatList,
  fetchProjects,
  fetchShips,
  fetchNextFatSerial,
  updateFat,
  type ProjectRecord,
  type ShipRecord
} from "../api";

import { useAuth } from "../auth-context";
import { FatEditor } from "../components/FatEditor";
import { ImageUploader } from "../components/ImageUploader";
import { ImageGallery } from "../components/ImageGallery";
import { resolveAvailableProjectId, useProjectContext } from "../project-context";


function resultColor(result: string | null): string {
  switch (result) {
    case "PASS":
      return "#16a34a";
    case "FAIL":
      return "#dc2626";
    case "CONDITIONAL":
    case "COMMENTS":
      return "#d97706";
    default:
      return "#64748b";
  }
}

interface FatEditDraft {
  title: string;
  discipline: string;
  content: string;
  result: string;
  remark: string;
  maker: string;
}

function createEditDraft(item: FatItemResponse): FatEditDraft {
  return {
    title: item.title,
    discipline: item.discipline,
    content: item.content,
    result: item.result || "",
    remark: item.remark || "",
    maker: item.maker || ""
  };
}

export function Fats() {
  const { session } = useAuth();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [selectedShipId, setSelectedShipId] = useState("");
  const [items, setItems] = useState<FatItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterKeyword, setFilterKeyword] = useState("");

  const [showEditor, setShowEditor] = useState(false);
  const [editorSerial, setEditorSerial] = useState<{ serial: number; formatted: string } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, FatEditDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingImagesId, setSavingImagesId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let active = true;
    fetchProjects()
      .then((data) => {
        if (!active) return;
        setProjects(data);
        const nextProjectId = resolveAvailableProjectId(data, selectedProjectId);
        if (nextProjectId !== selectedProjectId) {
          setSelectedProjectId(nextProjectId);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId) {
      setShips([]);
      setSelectedShipId("");
      return () => { active = false; };
    }
    fetchShips(selectedProjectId)
      .then((data) => {
        if (!active) return;
        setShips(data);
        setSelectedShipId((current) => (current && data.some((ship) => ship.id === current) ? current : ""));
      })
      .catch(() => {
        if (!active) return;
        setShips([]);
        setSelectedShipId("");
      });
    return () => { active = false; };
  }, [selectedProjectId]);

  const loadFats = useCallback(async () => {
    if (!selectedProjectId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchFatList({
        projectId: selectedProjectId,
        shipId: selectedShipId || undefined,
        keyword: filterKeyword.trim() || undefined
      });
      setItems(data);
      setEditDrafts(Object.fromEntries(data.map((item) => [item.id, createEditDraft(item)])));
    } catch (loadError: any) {
      setItems([]);
      setError(loadError?.message || "Failed to load FATs");
    } finally {
      setLoading(false);
    }
  }, [filterKeyword, selectedProjectId, selectedShipId]);

  useEffect(() => {
    void loadFats();
  }, [loadFats]);

  function updateLocalItem(nextItem: FatItemResponse): void {
    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setEditDrafts((current) => ({ ...current, [nextItem.id]: createEditDraft(nextItem) }));
  }

  async function handleOpenEditor() {
    if (!selectedShipId) return;
    try {
      const serialData = await fetchNextFatSerial(selectedShipId);
      setEditorSerial(serialData);
      setShowEditor(true);
    } catch (err: any) {
      alert(`Failed to fetch next serial: ${err?.message || "Unknown error"}`);
    }
  }

  async function handleSubmitFat(data: {
    title: string;
    content: string;
    result: string;
    remark: string;
    discipline: string;
    serialNo: number;
    imageAttachments: string[];
    maker: string;
  }) {
    if (!selectedShipId) return;
    const created = await createFat(selectedShipId, {
      shipId: selectedShipId,
      title: data.title,
      content: data.content,
      result: data.result,
      remark: data.remark || undefined,
      discipline: data.discipline,
      serialNo: data.serialNo,
      imageAttachments: data.imageAttachments,
      maker: data.maker || undefined
    });
    setItems((current) => [created, ...current]);
    setEditDrafts((current) => ({ ...current, [created.id]: createEditDraft(created) }));
    setShowEditor(false);
    setExpandedId(created.id);
  }

  async function handleDeleteFat(item: FatItemResponse): Promise<void> {
    const reference = item.formattedSerial || `#${item.serialNo}`;
    const confirmed = window.confirm(`确认删除 ${reference} 吗？此操作不可撤销。`);
    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      await deleteFat(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setEditDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setExpandedId((current) => (current === item.id ? null : current));
    } catch (deleteError: any) {
      alert(`Failed to delete FAT: ${deleteError?.message || "Unknown error"}`);
    } finally {
      setDeletingId((current) => (current === item.id ? null : current));
    }
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const draft = editDrafts[id];
    if (!draft) return;

    try {
      setSavingId(id);
      const updated = await updateFat(id, {
        title: draft.title.trim(),
        discipline: draft.discipline.trim(),
        content: draft.content.trim(),
        result: draft.result.trim() || null,
        remark: draft.remark.trim() || null,
        maker: draft.maker.trim() || null
      });
      updateLocalItem(updated);
    } catch (reviewError: any) {
      alert(`Failed to save changes: ${reviewError?.message || "Unknown error"}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleImageChange(item: FatItemResponse, images: string[]): Promise<void> {
    const previousImages = item.imageAttachments;
    updateLocalItem({ ...item, imageAttachments: images });

    try {
      setSavingImagesId(item.id);
      const updated = await updateFat(item.id, { imageAttachments: images });
      updateLocalItem(updated);
    } catch (imageError: any) {
      updateLocalItem({ ...item, imageAttachments: previousImages });
      alert(`Failed to save images: ${imageError?.message || "Unknown error"}`);
    } finally {
      setSavingImagesId((current) => (current === item.id ? null : current));
    }
  }

  async function handleDownloadPdf(item: FatItemResponse): Promise<void> {
    try {
      setPdfBusyId(item.id);
      const { exportFatToPdf } = await import("../utils/fat-export");
      await exportFatToPdf(item);
    } catch (pdfError: any) {
      alert(`Failed to generate PDF: ${pdfError?.message || "Unknown error"}`);
    } finally {
      setPdfBusyId((current) => (current === item.id ? null : current));
    }
  }

  // Group items by ship
  const groupedByShip = useMemo(() => {
    const groups = new Map<string, FatItemResponse[]>();
    for (const item of items) {
      const key = item.shipName || item.shipId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [items]);

  return (
    <>
      <style>{spinnerKeyframes}</style>
      <main className="fats-page" style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--nb-text)" }}>Factory Acceptance Tests</h1>
          <p style={{ fontSize: 16, color: "var(--nb-text)", margin: "8px 0 0", fontWeight: 600 }}>
            FAT MANAGEMENT · {selectedProject ? `${selectedProject.name} (${selectedProject.code})` : "NO PROJECT SELECTED"}
          </p>
        </div>
        <button
          className="nb-btn nb-btn-primary"
          onClick={() => void handleOpenEditor()}
          style={btnStyle("primary")}
          disabled={!selectedShipId}
        >
          {showEditor ? "Close Editor" : "+ Create FAT"}
        </button>
      </div>

      <div style={filterBarStyle}>
        <label style={labelInlineStyle}>
          <span>Ship</span>
          <select value={selectedShipId} onChange={(event) => setSelectedShipId(event.target.value)} style={inputStyle} disabled={ships.length === 0}>
            <option value="">All ships</option>
            {ships.map((ship) => (
              <option key={ship.id} value={ship.id}>
                {ship.shipName} ({ship.hullNumber})
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...labelInlineStyle, flex: 1, minWidth: 220 }}>
          <span>Search</span>
          <input
            type="text"
            value={filterKeyword}
            onChange={(event) => setFilterKeyword(event.target.value)}
            placeholder="Search title or remark..."
            style={{ ...inputStyle, width: "100%" }}
          />
        </label>
      </div>

      {showEditor && editorSerial && selectedProject && (
        <FatEditor
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          hullNumber={ships.find((s) => s.id === selectedShipId)?.hullNumber || ""}
          shipName={ships.find((s) => s.id === selectedShipId)?.shipName || ""}
          shipId={selectedShipId}
          authorName={session?.user.displayName || ""}
          userDisciplines={session?.user.disciplines || []}
          serialNo={editorSerial.serial}
          formattedSerial={editorSerial.formatted}
          projectOwner={selectedProject.owner ?? undefined}
          projectShipyard={selectedProject.shipyard ?? undefined}
          onSubmit={handleSubmitFat}
          onClose={() => setShowEditor(false)}
        />
      )}

      {!selectedProjectId ? (
        <div style={emptyStateStyle}>Please select a project first.</div>
      ) : loading ? (
        <div style={emptyStateStyle}>Loading FATs...</div>
      ) : error ? (
        <div style={{ ...emptyStateStyle, color: "#dc2626" }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={emptyStateStyle}>No FATs found for the current filters.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {Array.from(groupedByShip.entries()).map(([shipKey, shipItems]) => (
            <div key={shipKey}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--nb-text)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--nb-border, #e2e8f0)" }}>
                {shipKey} <span style={{ fontWeight: 400, color: "var(--nb-text-muted)", fontSize: 13 }}>({shipItems.length} items)</span>
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {shipItems.map((item) => {
                  const expanded = expandedId === item.id;
                  const editDraft = editDrafts[item.id] ?? createEditDraft(item);
                  const canEdit = !item.result || session?.user.role === "admin" || session?.user.role === "manager" || session?.user.id === item.authorId;
                  const canDelete = session?.user.role === "admin" || session?.user.role === "manager" || session?.user.id === item.authorId;

                  return (
                    <section key={item.id} style={panelStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                            <span style={tagStyle(resultColor(item.result))}>
                              {item.result || "PENDING"}
                            </span>
                            <strong style={{ fontSize: 16, color: "var(--nb-text)", wordBreak: "break-word" }}>{item.title}</strong>
                            <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                              {item.formattedSerial || `#${item.serialNo}`}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--nb-text-muted)", marginBottom: 8 }}>
                            Created by {item.authorName ?? item.authorId} on {new Date(item.createdAt).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 14, color: "var(--nb-text)", lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {item.content.length > 180 && !expanded ? `${item.content.slice(0, 180)}...` : item.content}
                          </div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--nb-text-muted)" }}>
                            <span style={{ wordBreak: "break-word" }}>Comments: {item.remark || "-"}</span>
                            <span>Discipline: {item.discipline}</span>
                            {item.maker ? <span>Maker: {item.maker}</span> : null}
                            <span>Images: {item.imageAttachments.length}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button type="button" style={btnStyle("secondary")} onClick={() => setExpandedId(expanded ? null : item.id)}>
                            {expanded ? "Hide Details" : "Show Details"}
                          </button>
                          <button
                            type="button"
                            style={btnStyle("secondary")}
                            onClick={() => void handleDownloadPdf(item)}
                            disabled={pdfBusyId === item.id}
                            aria-busy={pdfBusyId === item.id}
                          >
                            {pdfBusyId === item.id ? (
                              <span style={busyContentStyle}>
                                <span style={spinnerStyle} aria-hidden="true" />
                                Generating PDF...
                              </span>
                            ) : "Download PDF"}
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              style={dangerStyle}
                              onClick={() => void handleDeleteFat(item)}
                              disabled={deletingId === item.id}
                              aria-busy={deletingId === item.id}
                            >
                              {deletingId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {expanded ? (
                        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div style={{ ...subPanelStyle, borderLeft: canEdit ? "4px solid var(--nb-accent, #0f766e)" : "4px solid #cbd5e1" }}>
                              <div style={{ ...subTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>Edit FAT</span>
                                {canEdit ? <span style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>EDITABLE</span> : null}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <label style={labelStyle}>
                                  TITLE
                                  <input
                                    value={editDraft.title}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, title: event.target.value } }))}
                                    style={inputStyle}
                                    disabled={!canEdit}
                                  />
                                </label>
                                <label style={labelStyle}>
                                  MAKER
                                  <input
                                    value={editDraft.maker}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, maker: event.target.value } }))}
                                    style={inputStyle}
                                    disabled={!canEdit}
                                    placeholder="Enter maker/manufacturer..."
                                  />
                                </label>
                                <label style={labelStyle}>
                                  DISCIPLINE
                                  <select
                                    value={editDraft.discipline}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, discipline: event.target.value } }))}
                                    style={inputStyle}
                                    disabled={!canEdit}
                                  >
                                    {(DISCIPLINES as readonly string[]).map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </label>
                                <label style={labelStyle}>
                                  CONTENT
                                  <textarea
                                    value={editDraft.content}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, content: event.target.value } }))}
                                    rows={5}
                                    style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                                    disabled={!canEdit}
                                  />
                                </label>
                                <label style={labelStyle}>
                                  RESULT
                                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 4 }}>
                                    {["PASS", "FAIL", "COMMENTS"].map((r) => (
                                      <label key={r} style={{ display: "flex", alignItems: "center", cursor: canEdit ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}>
                                        <input
                                          type="radio"
                                          checked={editDraft.result === r}
                                          onChange={() => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, result: r } }))}
                                          disabled={!canEdit}
                                          style={{ accentColor: "#0d9488", marginRight: 6 }}
                                        />
                                        <span style={{ color: resultColor(r) }}>{r}</span>
                                      </label>
                                    ))}
                                  </div>
                                </label>
                                <label style={labelStyle}>
                                  COMMENTS
                                  <textarea
                                    value={editDraft.remark}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, remark: event.target.value } }))}
                                    rows={3}
                                    style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                                    disabled={!canEdit}
                                  />
                                </label>
                                {canEdit ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button type="button" style={btnStyle("primary")} onClick={() => void handleSaveEdit(item.id)} disabled={savingId === item.id}>
                                      {savingId === item.id ? "Saving..." : "Save Changes"}
                                    </button>
                                    <button type="button" style={btnStyle("secondary")} onClick={() => setEditDrafts((current) => ({ ...current, [item.id]: createEditDraft(item) }))}>
                                      Reset
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div style={subPanelStyle}>
                              <div style={subTitleStyle}>Images</div>
                              <ImageUploader
                                shipId={item.shipId}
                                existingImages={item.imageAttachments}
                                onImagesChange={(images) => void handleImageChange(item, images)}
                                disabled={savingImagesId === item.id}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div style={subPanelStyle}>
                              <div style={subTitleStyle}>Summary</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--nb-text)" }}>
                                <div><strong>Reference:</strong> {item.formattedSerial || `#${item.serialNo}`}</div>
                                <div><strong>Ship:</strong> {item.shipName} ({item.hullNumber})</div>
                                <div><strong>Discipline:</strong> {item.discipline}</div>
                                <div><strong>Maker:</strong> {item.maker || "-"}</div>
                                <div><strong>Result:</strong> <span style={{ color: resultColor(item.result), fontWeight: 700 }}>{item.result || "PENDING"}</span></div>
                                <div><strong>Created:</strong> {new Date(item.createdAt).toLocaleString()}</div>
                                <div><strong>Author:</strong> {item.authorName ?? item.authorId}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </main>
    </>
  );
}


function btnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  };
  if (variant === "primary") {
    return { ...base, background: "var(--nb-accent, #0f766e)", color: "#fff" };
  }
  return {
    ...base,
    background: "var(--nb-surface, #f8fafc)",
    color: "var(--nb-text, #334155)",
    border: "1px solid var(--nb-border, #e2e8f0)"
  };
}

const spinnerKeyframes = `
  @keyframes ncr-pdf-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const busyContentStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8
};

const spinnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid rgba(100, 116, 139, 0.25)",
  borderTopColor: "#0f766e",
  animation: "ncr-pdf-spin 0.8s linear infinite",
  flexShrink: 0
};

const dangerStyle: React.CSSProperties = {
  ...btnStyle("secondary"),
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c"
};

const panelStyle: React.CSSProperties = {
  background: "var(--nb-surface, #fff)",
  border: "1px solid var(--nb-border, #e2e8f0)",
  borderRadius: 12,
  padding: 18
};

const subPanelStyle: React.CSSProperties = {
  border: "1px solid var(--nb-border, #e2e8f0)",
  borderRadius: 10,
  padding: 14,
  background: "var(--nb-bg, #fff)"
};

const subTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  color: "var(--nb-text, #334155)",
  marginBottom: 10
};

const filterBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
  alignItems: "center"
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
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--nb-border, #e2e8f0)",
  fontSize: 13,
  background: "var(--nb-bg, #fff)",
  color: "var(--nb-text, #334155)"
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "56px 24px",
  color: "var(--nb-text-muted)"
};

function tagStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 999,
    background: `${color}18`,
    color,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  };
}
