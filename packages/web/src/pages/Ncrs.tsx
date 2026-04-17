import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { NcrItemResponse } from "@nbins/shared";
import {
  approveNcr,
  closeNcr,
  createNcr,
  deleteNcr,
  fetchNcrList,
  fetchProjects,
  fetchShips,
  fetchNextNcrSerial,
  updateNcr,
  type ProjectRecord,
  type ShipRecord
} from "../api";


import { useAuth } from "../auth-context";
import { NcrEditor } from "../components/NcrEditor";
import { ImageUploader } from "../components/ImageUploader";
import { ImageGallery } from "../components/ImageGallery";
import { RelatedFileUploader } from "../components/RelatedFileUploader";
import { resolveAvailableProjectId, useProjectContext } from "../project-context";


function badgeColor(status: NcrItemResponse["status"]): string {

  switch (status) {
    case "approved":
      return "#16a34a";
    case "rejected":
      return "#dc2626";
    case "pending_approval":
      return "#d97706";
    default:
      return "#64748b";
  }
}

interface NcrReviewDraft {
  title: string;
  discipline: string;
  content: string;
  rectifyRequest: string;
  remark: string;
}

function createReviewDraft(item: NcrItemResponse): NcrReviewDraft {
  return {
    title: item.title,
    discipline: item.discipline,
    content: item.content,
    rectifyRequest: item.rectifyRequest ?? "",
    remark: item.remark ?? ""
  };
}

export function Ncrs() {
  const { session } = useAuth();
  const canApprove = session?.user.role === "admin" || session?.user.role === "manager";
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [ships, setShips] = useState<ShipRecord[]>([]);
  const [selectedShipId, setSelectedShipId] = useState("");
  const [items, setItems] = useState<NcrItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterOpenClosed, setFilterOpenClosed] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");

  const [showEditor, setShowEditor] = useState(false);
  const [editorSerial, setEditorSerial] = useState<{ serial: number; formatted: string } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, NcrReviewDraft>>({});
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [savingImagesId, setSavingImagesId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
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

    fetchShips(selectedProjectId)
      .then((data) => {
        if (!active) {
          return;
        }

        setShips(data);
        setSelectedShipId((current) => (current && data.some((ship) => ship.id === current) ? current : ""));
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
    if (!selectedProjectId || !selectedShipId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchNcrList({
        projectId: selectedProjectId,
        shipId: selectedShipId,
        status: filterStatus || undefined,
        keyword: filterKeyword.trim() || undefined
      });
      
      // Apply open/closed filter on frontend
      let filteredData = data;
      if (filterOpenClosed === "open") {
        filteredData = data.filter(item => item.status === "approved" && !item.closedAt);
      } else if (filterOpenClosed === "closed") {
        filteredData = data.filter(item => item.status === "approved" && item.closedAt);
      }
      
      setItems(filteredData);
      setReviewDrafts(Object.fromEntries(filteredData.map((item) => [item.id, createReviewDraft(item)])));
    } catch (loadError: any) {
      setItems([]);
      setError(loadError?.message || "Failed to load NCRs");
    } finally {
      setLoading(false);
    }
  }, [filterKeyword, filterStatus, filterOpenClosed, selectedProjectId, selectedShipId]);

  useEffect(() => {
    void loadNcrs();
  }, [loadNcrs]);

  function updateLocalItem(nextItem: NcrItemResponse): void {
    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setReviewDrafts((current) => ({ ...current, [nextItem.id]: createReviewDraft(nextItem) }));
  }

  async function handleOpenEditor() {
    if (!selectedShipId) return;
    try {
      const serialData = await fetchNextNcrSerial(selectedShipId);
      setEditorSerial(serialData);
      setShowEditor(true);
    } catch (err: any) {
      alert(`Failed to fetch next serial: ${err?.message || "Unknown error"}`);
    }
  }

  async function handlePublishNcr(data: {
    title: string;
    content: string;
    rectifyRequest?: string;
    remark: string;
    discipline: string;
    serialNo: number;
    imageAttachments: string[];
  }) {
    if (!selectedShipId) return;
    const created = await createNcr(selectedShipId, {
      shipId: selectedShipId,
      title: data.title,
      content: data.content,
      rectifyRequest: data.rectifyRequest,
      remark: data.remark || undefined,
      discipline: data.discipline,
      serialNo: data.serialNo,
      imageAttachments: data.imageAttachments
    });
    setItems((current) => [created, ...current]);
    setReviewDrafts((current) => ({ ...current, [created.id]: createReviewDraft(created) }));
    setShowEditor(false);
    setExpandedId(created.id);
    alert("NCR 已提交，状态为待审批。请口头通知 manager 审核、修改并发布。");
  }

  async function handlePublish(id: string): Promise<void> {
    try {
      const updated = await approveNcr(id, { approved: true });
      updateLocalItem(updated);
      alert("NCR 已发布，正式 PDF 已同步生成。");
    } catch (approveError: any) {
      alert(`Failed to publish NCR: ${approveError?.message || "Unknown error"}`);
    }
  }

  async function handleDeleteNcr(item: NcrItemResponse): Promise<void> {
    const reference = item.formattedSerial || `#${item.serialNo}`;
    const confirmed = window.confirm(`确认删除 ${reference} 吗？此操作不可撤销。`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(item.id);
      await deleteNcr(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setReviewDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setExpandedId((current) => (current === item.id ? null : current));
      setSavingReviewId((current) => (current === item.id ? null : current));
      setSavingImagesId((current) => (current === item.id ? null : current));
      setPdfBusyId((current) => (current === item.id ? null : current));
      alert("NCR 已删除。");
    } catch (deleteError: any) {
      alert(`Failed to delete NCR: ${deleteError?.message || "Unknown error"}`);
    } finally {
      setDeletingId((current) => (current === item.id ? null : current));
    }
  }

  async function handleCloseNcr(id: string, closed: boolean): Promise<void> {
    try {
      const updated = await closeNcr(id, { closed });
      updateLocalItem(updated);
    } catch (err: any) {
      alert(`Failed to ${closed ? "close" : "open"} NCR: ${err?.message || "Unknown error"}`);
    }
  }

  async function handleUpdateReply(id: string, data: Partial<NcrItemResponse>): Promise<void> {
    try {
      const updated = await updateNcr(id, {
        builderReply: data.builderReply,
        replyDate: data.replyDate,
        verifiedBy: data.verifiedBy,
        verifyDate: data.verifyDate
      });
      updateLocalItem(updated);
      console.log("Reply updated successfully.");
    } catch (err: any) {
      alert(`Failed to update reply: ${err?.message || "Unknown error"}`);
    }
  }

  async function handleSaveReview(id: string): Promise<void> {
    const draft = reviewDrafts[id];
    if (!draft) {
      return;
    }

    try {
      setSavingReviewId(id);
      const updated = await updateNcr(id, {
        title: draft.title.trim(),
        discipline: draft.discipline.trim(),
        content: draft.content.trim(),
        rectifyRequest: draft.rectifyRequest.trim() || null,
        remark: draft.remark.trim() || null
      });
      updateLocalItem(updated);
    } catch (reviewError: any) {
      alert(`Failed to save review changes: ${reviewError?.message || "Unknown error"}`);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function handleImageChange(item: NcrItemResponse, images: string[]): Promise<void> {
    const previousImages = item.imageAttachments;
    updateLocalItem({ ...item, imageAttachments: images, attachments: images });

    try {
      setSavingImagesId(item.id);
      const updated = await updateNcr(item.id, { imageAttachments: images });
      updateLocalItem(updated);
    } catch (imageError: any) {
      updateLocalItem({ ...item, imageAttachments: previousImages, attachments: previousImages });
      alert(`Failed to save images: ${imageError?.message || "Unknown error"}`);
    } finally {
      setSavingImagesId((current) => (current === item.id ? null : current));
    }
  }

  async function handleDownloadPdf(item: NcrItemResponse): Promise<void> {
    try {
      setPdfBusyId(item.id);
      const { exportNcrToPdf } = await import("../utils/ncr-export");
      await exportNcrToPdf(item);
    } catch (pdfError: any) {
      alert(`Failed to generate PDF: ${pdfError?.message || "Unknown error"}`);
    } finally {
      setPdfBusyId((current) => (current === item.id ? null : current));
    }
  }


  return (
    <>
      <style>{spinnerKeyframes}</style>
      <main className="ncrs-page" style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--nb-text)" }}>Non-Conformance Reports</h1>
          <p style={{ fontSize: 13, color: "var(--nb-text-muted)", margin: "4px 0 0" }}>
            NCR MANAGEMENT · {selectedProject ? `${selectedProject.name} (${selectedProject.code})` : "NO PROJECT SELECTED"}
          </p>
        </div>
        <button
          className="nb-btn nb-btn-primary"
          onClick={() => void handleOpenEditor()}
          style={btnStyle("primary")}
          disabled={!selectedShipId}
        >
          {showEditor ? "Close Editor" : "+ Create NCR"}
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

        <label style={labelInlineStyle}>
          <span>Status</span>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} style={inputStyle}>
            <option value="">All status</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
          </select>

        </label>

        <label style={labelInlineStyle}>
          <span>Open/Closed</span>
          <select value={filterOpenClosed} onChange={(event) => setFilterOpenClosed(event.target.value)} style={inputStyle}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label style={{ ...labelInlineStyle, flex: 1, minWidth: 220 }}>
          <span>Remark / Title</span>
          <input
            type="text"
            value={filterKeyword}
            onChange={(event) => setFilterKeyword(event.target.value)}
            placeholder="Search remark or title..."
            style={{ ...inputStyle, width: "100%" }}
          />
        </label>
      </div>

      {showEditor && editorSerial && selectedProject && (
        <NcrEditor
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          hullNumber={ships.find((s) => s.id === selectedShipId)?.hullNumber || ""}
          shipName={ships.find((s) => s.id === selectedShipId)?.shipName || ""}
          shipId={selectedShipId}
          authorName={session?.user.displayName || ""}
          userDisciplines={session?.user.disciplines || []}
          serialNo={editorSerial.serial}
          formattedSerial={editorSerial.formatted}
          onPublish={handlePublishNcr}
          onClose={() => setShowEditor(false)}
        />
      )}

      {!selectedProjectId ? (
        <div style={emptyStateStyle}>Please select a project first.</div>
      ) : loading ? (
        <div style={emptyStateStyle}>Loading NCRs...</div>
      ) : error ? (
        <div style={{ ...emptyStateStyle, color: "#dc2626" }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={emptyStateStyle}>No NCRs found for the current filters.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const reviewDraft = reviewDrafts[item.id] ?? createReviewDraft(item);
            const canReviewEdit = canApprove && !item.closedAt && item.status === "pending_approval";
            const canDownloadPdf = item.status === "approved" || !!item.pdf;
            const canDelete = canApprove || session?.user.id === item.authorId;


            return (
              <section key={item.id} style={panelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={tagStyle(badgeColor(item.status))}>
                        {item.status.replace(/_/g, " ").toUpperCase()}
                        {item.status === "approved" && (
                          item.closedAt 
                            ? " & CLOSED" 
                            : <span style={{ color: "#dc2626" }}> & OPEN</span>
                        )}
                      </span>
                      <strong style={{ fontSize: 16, color: "var(--nb-text)", wordBreak: "break-word" }}>{item.title}</strong>
                      <span style={{ fontSize: 12, color: "var(--nb-text-muted)" }}>
                        {item.shipName ? `${item.shipName} (${item.hullNumber ?? item.shipId})` : item.shipId}
                        {" · "}
                        {item.formattedSerial || `#${item.serialNo}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--nb-text-muted)", marginBottom: 8 }}>
                      Raised by {item.authorName ?? item.authorId} on {new Date(item.createdAt).toLocaleString()}
                      {item.approvedBy
                        ? ` · Published by ${item.approvedByName ?? item.approvedBy}${item.approvedAt ? ` on ${new Date(item.approvedAt).toLocaleString()}` : ""}`
                        : ""}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--nb-text)", lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {item.content.length > 180 && !expanded ? `${item.content.slice(0, 180)}...` : item.content}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--nb-text-muted)" }}>
                      <span style={{ wordBreak: "break-word" }}>Remark: {item.remark || "-"}</span>
                      <span>Images: {item.imageAttachments.length}</span>
                      <span>Files: {item.relatedFiles.length}</span>
                      <span>Official PDF: {item.pdf ? `v${item.pdf.version}` : "Not published"}</span>
                    </div>
                    {item.closedAt && (
                      <div style={tagStyle("#64748b")}>
                        CLOSED • {item.closedAt.slice(0, 10)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" style={btnStyle("secondary")} onClick={() => setExpandedId(expanded ? null : item.id)}>
                      {expanded ? "Hide Details" : "Show Details"}
                    </button>
                    {canDownloadPdf ? (
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
                    ) : null}

                    {canApprove && item.status === "pending_approval" ? (
                      <button type="button" style={btnStyle("primary")} onClick={() => void handlePublish(item.id)}>
                        Publish
                      </button>
                    ) : null}

                    {canDelete ? (
                      <button
                        type="button"
                        style={dangerStyle}
                        onClick={() => void handleDeleteNcr(item)}
                        disabled={deletingId === item.id}
                        aria-busy={deletingId === item.id}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete NCR"}
                      </button>
                    ) : null}

                    {item.status === "approved" && (
                      <button
                        type="button"
                        style={item.closedAt ? btnStyle("secondary") : dangerStyle}
                        onClick={() => void handleCloseNcr(item.id, !item.closedAt)}
                      >
                        {item.closedAt ? "Re-open NCR" : "Close NCR"}
                      </button>
                    )}
                  </div>
                </div>

                {expanded ? (
                  <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ ...subPanelStyle, borderLeft: canReviewEdit ? "4px solid var(--nb-accent, #0f766e)" : "4px solid #cbd5e1" }}>
                        <div style={{ ...subTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Manager Review Draft</span>
                          {canReviewEdit ? <span style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>EDITABLE BEFORE PUBLISH</span> : null}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <label style={labelStyle}>
                            TITLE
                            <input
                              value={reviewDraft.title}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...reviewDraft, title: event.target.value } }))}
                              style={inputStyle}
                              disabled={!canReviewEdit}
                            />
                          </label>
                          <label style={labelStyle}>
                            DISCIPLINE
                            <input
                              value={reviewDraft.discipline}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...reviewDraft, discipline: event.target.value } }))}
                              style={inputStyle}
                              disabled={!canReviewEdit}
                            />
                          </label>
                          <label style={labelStyle}>
                            DESCRIPTION OF NON-CONFORMITY
                            <textarea
                              value={reviewDraft.content}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...reviewDraft, content: event.target.value } }))}
                              rows={6}
                              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                              disabled={!canReviewEdit}
                            />
                          </label>
                          <label style={labelStyle}>
                            REQUESTED RECTIFY
                            <textarea
                              value={reviewDraft.rectifyRequest}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...reviewDraft, rectifyRequest: event.target.value } }))}
                              rows={4}
                              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                              disabled={!canReviewEdit}
                            />
                          </label>
                          <label style={labelStyle}>
                            REMARK
                            <textarea
                              value={reviewDraft.remark}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...reviewDraft, remark: event.target.value } }))}
                              rows={3}
                              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                              disabled={!canReviewEdit}
                            />
                          </label>
                          {canReviewEdit ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" style={btnStyle("primary")} onClick={() => void handleSaveReview(item.id)} disabled={savingReviewId === item.id}>
                                {savingReviewId === item.id ? "Saving..." : "Save Review Changes"}
                              </button>
                              <button type="button" style={btnStyle("secondary")} onClick={() => setReviewDrafts((current) => ({ ...current, [item.id]: createReviewDraft(item) }))}>
                                Reset Draft
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div style={subPanelStyle}>
                        <div style={subTitleStyle}>Images</div>
                        {item.status === "pending_approval" || item.status === "draft" ? (
                          <ImageUploader
                            shipId={item.shipId}
                            existingImages={item.imageAttachments}
                            onImagesChange={(images) => void handleImageChange(item, images)}
                            disabled={savingImagesId === item.id}
                          />
                        ) : (
                          <>
                            {item.imageAttachments.length > 0 ? (
                              <ImageGallery
                                shipId={item.shipId}
                                images={item.imageAttachments}
                              />
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--nb-text-muted, #64748b)", fontStyle: "italic" }}>
                                No images attached
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={subPanelStyle}>
                        <div style={subTitleStyle}>Related Files</div>
                        <RelatedFileUploader
                          ncrId={item.id}
                          files={item.relatedFiles}
                          onFilesChange={(files) => updateLocalItem({ ...item, relatedFiles: files })}
                        />
                      </div>

                      <div style={{ ...subPanelStyle, borderLeft: "4px solid #0f172a" }}>
                        <div style={{ ...subTitleStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Shipbuilder's Formal Reply</span>
                          {item.closedAt && <span style={{ fontSize: 10, color: "#64748b" }}>🔒 READ ONLY (CLOSED)</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <label style={labelStyle}>
                            REPLY CONTENT
                            <textarea
                              style={{ ...inputStyle, minHeight: 80 }}
                              defaultValue={item.builderReply || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (item.builderReply || "")) {
                                  void handleUpdateReply(item.id, { builderReply: e.target.value });
                                }
                              }}
                              disabled={!!item.closedAt}
                              placeholder="Enter shipyard corrective actions..."
                            />
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label style={labelStyle}>
                              REPLY DATE
                              <input
                                type="date"
                                style={inputStyle}
                                defaultValue={item.replyDate || ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (item.replyDate || "")) {
                                    void handleUpdateReply(item.id, { replyDate: e.target.value });
                                  }
                                }}
                                disabled={!!item.closedAt}
                              />
                            </label>
                            <label style={labelStyle}>
                              VERIFIED BY (PG)
                              <input
                                style={inputStyle}
                                defaultValue={item.verifiedBy || ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (item.verifiedBy || "")) {
                                    void handleUpdateReply(item.id, { verifiedBy: e.target.value });
                                  }
                                }}
                                disabled={!!item.closedAt}
                              />
                            </label>
                          </div>
                          <label style={labelStyle}>
                            VERIFICATION DATE
                            <input
                              type="date"
                              style={inputStyle}
                              defaultValue={item.verifyDate || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (item.verifyDate || "")) {
                                  void handleUpdateReply(item.id, { verifyDate: e.target.value });
                                }
                              }}
                              disabled={!!item.closedAt}
                            />
                          </label>
                        </div>
                        {item.closedBy && (
                          <div style={{ marginTop: 15, padding: 10, background: "#f8fafc", borderRadius: 8, fontSize: 11, color: "#64748b" }}>
                            ✅ <strong>Closed by</strong> {item.closedByName || item.closedBy} on {new Date(item.closedAt!).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
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
