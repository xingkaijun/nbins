import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FatItemResponse } from "@nbins/shared";
import type { FatComment } from "@nbins/shared";
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
import { ImageUploader } from "../components/ImageUploader";
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
  comments: FatComment[];
  maker: string;
  inspectionDate: string;
  newCommentsText: string;
}

function computeResultFromComments(comments: FatComment[]): string {
  const openCount = comments.filter((c) => c.status === "open").length;
  if (openCount > 0) return "COMMENTS";
  if (comments.length > 0) return "PASS";
  return "PASS";
}

function createEditDraft(item: FatItemResponse): FatEditDraft {
  return {
    title: item.title,
    discipline: item.discipline,
    content: item.content,
    result: item.result || "",
    comments: item.comments || [],
    maker: item.maker || "",
    inspectionDate: item.inspectionDate || "",
    newCommentsText: ""
  };
}

function needsEdit(item: FatItemResponse): boolean {
  return !item.content || item.content.trim().length === 0;
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

  // Quick-create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createMaker, setCreateMaker] = useState("");
  const [createDiscipline, setCreateDiscipline] = useState("GENERAL");
  const [createInspectionDate, setCreateInspectionDate] = useState("");
  const [creating, setCreating] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, FatEditDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingImagesId, setSavingImagesId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  function openCreateDialog() {
    if (!selectedShipId) return;
    const userDisciplines = session?.user.disciplines || [];
    setCreateDiscipline(userDisciplines.length > 0 ? userDisciplines[0] : "GENERAL");
    setCreateTitle("");
    setCreateMaker("");
    setCreateInspectionDate("");
    setShowCreateDialog(true);
  }

  async function handleQuickCreate() {
    if (!selectedShipId || !createTitle.trim()) return;
    try {
      setCreating(true);
      const serialData = await fetchNextFatSerial(selectedShipId);
      const created = await createFat(selectedShipId, {
        shipId: selectedShipId,
        title: createTitle.trim(),
        content: "",
        discipline: createDiscipline,
        serialNo: serialData.serial,
        comments: [],
        maker: createMaker.trim() || undefined,
        inspectionDate: createInspectionDate || undefined
      });
      setItems((current) => [created, ...current]);
      setEditDrafts((current) => ({ ...current, [created.id]: createEditDraft(created) }));
      setShowCreateDialog(false);
      setCreateTitle("");
      setCreateMaker("");
      setCreateInspectionDate("");
    } catch (err: any) {
      alert(`Failed to create FAT: ${err?.message || "Unknown error"}`);
    } finally {
      setCreating(false);
    }
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

    // Generate new comments from textarea (newline-separated)
    const newCommentTexts = draft.newCommentsText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const newComments: FatComment[] = newCommentTexts.map((text) => ({
      id: crypto.randomUUID(),
      content: text,
      status: "open" as const,
      createdAt: new Date().toISOString()
    }));
    const allComments = [...draft.comments, ...newComments];

    try {
      setSavingId(id);
      const updated = await updateFat(id, {
        title: draft.title.trim(),
        discipline: draft.discipline.trim(),
        content: draft.content.trim(),
        result: computeResultFromComments(allComments) || null,
        comments: allComments,
        maker: draft.maker.trim() || null,
        inspectionDate: draft.inspectionDate.trim() || null
      });
      updateLocalItem(updated);
      setSuccessMessage("Changes saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (reviewError: any) {
      alert(`Failed to save changes: ${reviewError?.message || "Unknown error"}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleCloseComment(itemId: string, commentId: string): Promise<void> {
    const draft = editDrafts[itemId];
    if (!draft) return;

    const userName = session?.user.displayName || session?.user.id || "";
    const now = new Date().toISOString();
    const updatedComments = draft.comments.map((c) =>
      c.id === commentId ? { ...c, status: "closed" as const, closedBy: userName, closedAt: now } : c
    );

    setEditDrafts((current) => ({
      ...current,
      [itemId]: { ...draft, comments: updatedComments, result: computeResultFromComments(updatedComments) }
    }));

    try {
      setSavingId(itemId);
      const updated = await updateFat(itemId, {
        comments: updatedComments,
        result: computeResultFromComments(updatedComments) || null
      });
      updateLocalItem(updated);
    } catch (e: any) {
      alert(`Failed to close comment: ${e?.message || "Unknown error"}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleReopenComment(itemId: string, commentId: string): Promise<void> {
    const draft = editDrafts[itemId];
    if (!draft) return;

    const updatedComments = draft.comments.map((c) =>
      c.id === commentId ? { ...c, status: "open" as const, closedBy: undefined, closedAt: undefined } : c
    );

    setEditDrafts((current) => ({
      ...current,
      [itemId]: { ...draft, comments: updatedComments, result: computeResultFromComments(updatedComments) }
    }));

    try {
      setSavingId(itemId);
      const updated = await updateFat(itemId, {
        comments: updatedComments,
        result: computeResultFromComments(updatedComments) || null
      });
      updateLocalItem(updated);
    } catch (e: any) {
      alert(`Failed to reopen comment: ${e?.message || "Unknown error"}`);
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
      {successMessage && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          padding: "10px 20px", borderRadius: 8,
          background: "#dcfce7", border: "1px solid #86efac", color: "#166534",
          fontSize: 13, fontWeight: 700,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          animation: "fadeIn 0.3s ease"
        }}>
          ✓ {successMessage}
        </div>
      )}
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
          onClick={openCreateDialog}
          style={btnStyle("primary")}
          disabled={!selectedShipId}
        >
          + Create FAT
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
            placeholder="Search title or comments..."
            style={{ ...inputStyle, width: "100%" }}
          />
        </label>
      </div>

      {/* Quick-create dialog */}
      {showCreateDialog && (
        <div style={overlayStyle} onClick={() => setShowCreateDialog(false)}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "var(--nb-text)" }}>Create New FAT</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={labelStyle}>
                EQUIPMENT (设备)
                <input
                  autoFocus
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && createTitle.trim()) void handleQuickCreate(); }}
                  placeholder="Enter equipment name..."
                  style={{ ...inputStyle, width: "100%" }}
                />
              </label>
              <label style={labelStyle}>
                MAKER (厂家)
                <input
                  value={createMaker}
                  onChange={(e) => setCreateMaker(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && createTitle.trim()) void handleQuickCreate(); }}
                  placeholder="Enter manufacturer..."
                  style={{ ...inputStyle, width: "100%" }}
                />
              </label>
              <label style={labelStyle}>
                DISCIPLINE (专业)
                <select
                  value={createDiscipline}
                  onChange={(e) => setCreateDiscipline(e.target.value)}
                  style={{ ...inputStyle, width: "100%" }}
                >
                  {(DISCIPLINES as readonly string[]).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                INSPECTION DATE (检验日期)
                <input
                  type="date"
                  value={createInspectionDate}
                  onChange={(e) => setCreateInspectionDate(e.target.value)}
                  style={{ ...inputStyle, width: "100%" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" style={btnStyle("secondary")} onClick={() => setShowCreateDialog(false)}>Cancel</button>
              <button
                type="button"
                style={btnStyle("primary")}
                disabled={!createTitle.trim() || creating}
                onClick={() => void handleQuickCreate()}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
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
                  const openCount = (item.comments || []).filter((c) => c.status === "open").length;
                  const isPending = needsEdit(item);

                  return (
                    <section key={item.id} style={{ ...panelStyle, cursor: "pointer", ...(isPending ? { borderLeft: "4px solid #d97706" } : {}) }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(expanded ? null : item.id); } }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flex: 1, minWidth: 280 }}>
                          <span style={{ fontSize: 12, color: "var(--nb-text-muted)", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                          <span style={tagStyle(resultColor(item.result))}>
                            {item.result || "PENDING"}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--nb-text-muted)", fontWeight: 600, fontFamily: "monospace" }}>
                            {item.formattedSerial || `#${item.serialNo}`}
                          </span>
                          <strong style={{ fontSize: 15, color: "var(--nb-text)", wordBreak: "break-word" }}>{item.title}</strong>
                          {(item.comments || []).length > 0 && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                              background: openCount > 0 ? "#fef3c7" : "#dcfce7",
                              color: openCount > 0 ? "#b45309" : "#15803d"
                            }}>
                              {openCount > 0 ? `${openCount} open` : "All closed"}
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                            {item.discipline}
                          </span>
                          {item.maker && (
                            <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                              {item.maker}
                            </span>
                          )}
                          {item.inspectionDate && (
                            <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                              {item.inspectionDate}
                            </span>
                          )}
                          {isPending && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                              background: "#fef3c7", color: "#b45309", letterSpacing: 0.5,
                              animation: "needEditPulse 2s ease-in-out infinite"
                            }}>
                              NEED TO EDIT
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
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
                        <div className="expansionColumns" style={{ marginTop: 16 }}>
                          {/* Left Column: Detail Hero + Edit Form + Comments */}
                          <div>
                            <div className="detailHero">
                              <h3>{item.title}</h3>
                              <div className="detailSummaryGrid" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                                <div className="infoCard" style={{ flex: 1, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ margin: 0 }}>Reference</span>
                                  <strong style={{ fontSize: 11 }}>{item.formattedSerial || `#${item.serialNo}`}</strong>
                                </div>
                                <div className="infoCard" style={{ flex: 1, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ margin: 0 }}>Ship</span>
                                  <strong style={{ fontSize: 11 }}>{item.shipName} ({item.hullNumber})</strong>
                                </div>
                                <div className="infoCard" style={{ flex: 1, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ margin: 0 }}>Discipline</span>
                                  <strong style={{ fontSize: 11 }}>{item.discipline}</strong>
                                </div>
                                <div className="infoCard" style={{ flex: 1, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ margin: 0 }}>Result</span>
                                  <strong style={{ fontSize: 11, color: resultColor(item.result) }}>{item.result || "PENDING"}</strong>
                                </div>
                                {item.inspectionDate && (
                                  <div className="infoCard" style={{ flex: 1, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ margin: 0 }}>Inspection Date</span>
                                    <strong style={{ fontSize: 11 }}>{item.inspectionDate}</strong>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Edit Panel */}
                            <div className="panel">
                              <div className="panelHeader">
                                <p className="eyebrow">EDIT FAT {canEdit ? <span className="badge" style={{ marginLeft: 8, padding: "2px 6px", fontSize: 8 }}>EDITABLE</span> : null}</p>
                              </div>
                              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                                <label className="field">
                                  <span>EQUIPMENT</span>
                                  <input
                                    value={editDraft.title}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, title: event.target.value } }))}
                                    disabled={!canEdit}
                                  />
                                </label>
                                <label className="field">
                                  <span>MAKER</span>
                                  <input
                                    value={editDraft.maker}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, maker: event.target.value } }))}
                                    disabled={!canEdit}
                                    placeholder="Enter maker/manufacturer..."
                                  />
                                </label>
                                <label className="field">
                                  <span>DISCIPLINE</span>
                                  <select
                                    value={editDraft.discipline}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, discipline: event.target.value } }))}
                                    style={{ width: "100%", border: "1px solid rgba(148,163,184,0.4)", borderRadius: 8, background: "#fff", padding: "6px 10px", color: "var(--nb-text)", font: "inherit", fontSize: 10 }}
                                    disabled={!canEdit}
                                  >
                                    {(DISCIPLINES as readonly string[]).map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>INSPECTION DATE</span>
                                  <input
                                    type="date"
                                    value={editDraft.inspectionDate}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, inspectionDate: event.target.value } }))}
                                    disabled={!canEdit}
                                  />
                                </label>
                                <label className="field">
                                  <span>TEST DESCRIPTION</span>
                                  <textarea
                                    value={editDraft.content}
                                    onChange={(event) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, content: event.target.value } }))}
                                    rows={5}
                                    disabled={!canEdit}
                                    placeholder="Enter test description..."
                                  />
                                </label>
                              </div>
                            </div>

                            {/* Comments Panel */}
                            <div className="panel">
                              <div className="panelHeader">
                                <p className="eyebrow">COMMENTS ({openCount} OPEN)</p>
                                <span className="badge">{editDraft.comments.length} total</span>
                              </div>
                              <div className="commentList" style={{ marginTop: 8 }}>
                                {editDraft.comments.length > 0 ? (
                                  editDraft.comments.map((c, idx) => (
                                    <article className="commentCard" key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                      <div style={{ flex: 1, display: "grid", gap: 4, minWidth: 0 }}>
                                        <strong style={{ fontSize: 11, lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                                          <span style={{ color: "var(--nb-text-muted)", fontWeight: 800, marginRight: 6 }}>#{idx + 1}</span>
                                          {c.content}
                                        </strong>
                                        <div style={{ color: "var(--nb-text-muted)", fontSize: 10, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                                          <span>Raised by {c.authorName || "unknown"}</span>
                                          {c.closedAt && (
                                            <>
                                              <span>·</span>
                                              <span>Closed by {c.closedBy || "unknown"}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                        <span className={`commentStatus ${c.status}`}>{c.status}</span>
                                        {canEdit && c.status === "open" && (
                                          <button
                                            type="button"
                                            className="commentCheckboxLabel"
                                            onClick={() => void handleCloseComment(item.id, c.id)}
                                            disabled={savingId === item.id}
                                          >
                                            {savingId === item.id ? "Closing..." : "Close"}
                                          </button>
                                        )}
                                        {canEdit && c.status === "closed" && (
                                          <button
                                            type="button"
                                            className="commentCheckboxLabel"
                                            style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fee2e2" }}
                                            onClick={() => void handleReopenComment(item.id, c.id)}
                                            disabled={savingId === item.id}
                                          >
                                            Reopen
                                          </button>
                                        )}
                                      </div>
                                    </article>
                                  ))
                                ) : (
                                  <div className="emptyState">No comments yet.</div>
                                )}
                              </div>
                              {canEdit && (
                                <AddCommentInput
                                  value={editDraft.newCommentsText}
                                  onChange={(text) => setEditDrafts((current) => ({ ...current, [item.id]: { ...editDraft, newCommentsText: text } }))}
                                  disabled={savingId === item.id}
                                />
                              )}
                            </div>
                          </div>

                          {/* Right Column: Result + Images + Actions */}
                          <div>
                            {/* Result Panel */}
                            <div className="panel" style={{ padding: 0 }}>
                              <div className="panelHeader" style={{ paddingBottom: 12, borderBottom: "1px solid rgba(148,163,184,0.2)" }}>
                                <p className="eyebrow">RESULT (AUTO-COMPUTED)</p>
                              </div>
                              <div style={{ padding: 12 }}>
                                <div className="previewGrid">
                                  <div className="previewCard">
                                    <span>Current Result</span>
                                    <strong style={{ color: resultColor(computeResultFromComments(editDraft.comments)) }}>
                                      {computeResultFromComments(editDraft.comments)}
                                    </strong>
                                  </div>
                                  <div className="previewCard">
                                    <span>Open Comments</span>
                                    <strong>{openCount}</strong>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Images Panel */}
                            <div className="panel">
                              <div className="panelHeader">
                                <p className="eyebrow">IMAGES</p>
                                <span className="badge">{item.imageAttachments.length}</span>
                              </div>
                              <div style={{ marginTop: 8 }}>
                                <ImageUploader
                                  shipId={item.shipId}
                                  existingImages={item.imageAttachments}
                                  onImagesChange={(images) => void handleImageChange(item, images)}
                                  disabled={savingImagesId === item.id}
                                  label="FAT Images"
                                />
                              </div>
                            </div>

                            {/* Summary Info Cards */}
                            <div className="panel">
                              <div className="panelHeader">
                                <p className="eyebrow">DETAILS</p>
                              </div>
                              <div className="summaryGrid" style={{ marginTop: 8 }}>
                                <div className="summaryCard">
                                  <p>Equipment</p>
                                  <strong style={{ fontSize: 13 }}>{item.title || "-"}</strong>
                                </div>
                                <div className="summaryCard">
                                  <p>Maker</p>
                                  <strong style={{ fontSize: 13 }}>{item.maker || "-"}</strong>
                                </div>
                                <div className="summaryCard">
                                  <p>Author</p>
                                  <strong style={{ fontSize: 13 }}>{item.authorName ?? item.authorId}</strong>
                                </div>
                                <div className="summaryCard">
                                  <p>Created</p>
                                  <strong style={{ fontSize: 13 }}>{new Date(item.createdAt).toLocaleDateString()}</strong>
                                </div>
                                <div className="summaryCard">
                                  <p>Updated</p>
                                  <strong style={{ fontSize: 13 }}>{new Date(item.updatedAt).toLocaleDateString()}</strong>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            {canEdit && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                                <button className="submitButton" style={{ flex: 1 }} type="button" onClick={() => void handleSaveEdit(item.id)} disabled={savingId === item.id}>
                                  {savingId === item.id ? "SUBMITTING..." : "SUBMIT"}
                                </button>
                                <button type="button" className="commentCheckboxLabel" style={{ background: "var(--nb-bg)", color: "var(--nb-text-muted)" }} onClick={() => setEditDrafts((current) => ({ ...current, [item.id]: createEditDraft(item) }))}>
                                  Reset
                                </button>
                              </div>
                            )}
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

      <style>{`
        @keyframes needEditPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}

function AddCommentInput({ value, onChange, disabled }: { value: string; onChange: (text: string) => void; disabled: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const lines = value.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const hasContent = lines.length > 0;

  return (
    <label className="field" style={{ marginTop: 8 }}>
      <span>NEW COMMENTS (ONE PER LINE)</span>
      <textarea
        ref={(el) => { textareaRef.current = el; autoResize(el); }}
        value={value}
        onChange={(e) => { onChange(e.target.value); autoResize(e.target); }}
        placeholder={"Enter comments, one per line...\n\n1st comment here\n2nd comment here"}
        disabled={disabled}
        style={{ minHeight: 60, resize: "none", overflow: "hidden" }}
      />
      {hasContent && (
        <div style={{ fontSize: 11, color: "var(--nb-accent, #0f766e)", fontWeight: 600, marginTop: 2 }}>
          {lines.length} comment{lines.length > 1 ? "s" : ""} ready to submit
        </div>
      )}
    </label>
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
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const dialogStyle: React.CSSProperties = {
  background: "var(--nb-surface, #fff)",
  borderRadius: 12,
  padding: 24,
  minWidth: 400,
  maxWidth: 500,
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)"
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
