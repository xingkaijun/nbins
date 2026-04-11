import React, { useEffect, useMemo, useState } from "react";
import {
  COMMENT_STATUSES,
  DISCIPLINES,
  INSPECTION_RESULTS,
  INSPECTION_RESULT_LABELS,
  type InspectionItemComment,
  type InspectionItemDetailResponse,
  type InspectionListItem,
  type InspectionResult,
  syncListItemWithDetail
} from "@nbins/shared";
import { ApiError, fetchInspectionList, fetchInspectionDetail, fetchProjects, type ProjectRecord } from "../api";
import { type DetailTransportMode, useInspectionDetail } from "../useInspectionDetail";
import { generateInspectionChecklistPdf, generateInspectionReport } from "../utils/pdf-generator";
import { useAuth } from "../auth-context";

const resultOptions = INSPECTION_RESULTS;
const commentStatusLabels = {
  open: "Open",
  closed: "Closed"
} satisfies Record<(typeof COMMENT_STATUSES)[number], string>;

function resultTone(result: InspectionResult | null): string {
  switch (result) {
    case "AA": return "result-aa";
    case "QCC": return "result-qcc";
    case "OWC": return "result-owc";
    case "RJ": return "result-rj";
    case "CX": return "result-cx";
    default: return "result-pending";
  }
}

function formatStamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildCommentDrafts(commentText: string): Array<{ id: string; message: string }> {
  return commentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((message, index) => ({
      id: `draft-${index + 1}`,
      message
    }));
}

function buildSubmissionPreview(
  detail: InspectionItemDetailResponse,
  selectedResult: InspectionResult,
  draftComments: Array<{ id: string; message: string }>
): {
  nextResult: InspectionResult | null;
  nextWorkflowLabel: string;
  nextOpenComments: number;
  nextPendingFinalAcceptance: boolean;
  nextWaitingForNextRound: boolean;
} {
  const existingOpenComments = detail.comments.filter((comment) => comment.status === "open").length;
  const addedOpenComments = selectedResult === "AA" || selectedResult === "CX" ? 0 : draftComments.length;
  const nextOpenComments = existingOpenComments + addedOpenComments;
  const totalComments = detail.comments.length + draftComments.length;

  if (totalComments > 0 && nextOpenComments === 0 && selectedResult !== "CX") {
    return {
      nextResult: "AA",
      nextWorkflowLabel: "Closed / accepted",
      nextOpenComments: 0,
      nextPendingFinalAcceptance: false,
      nextWaitingForNextRound: false
    };
  }

  switch (selectedResult) {
    case "AA":
      return {
        nextResult: nextOpenComments > 0 ? null : "AA",
        nextWorkflowLabel: nextOpenComments > 0 ? "Open / final acceptance pending" : "Closed / accepted",
        nextOpenComments,
        nextPendingFinalAcceptance: nextOpenComments > 0,
        nextWaitingForNextRound: false
      };
    case "QCC":
      return {
        nextResult: totalComments === 0 ? "QCC" : (nextOpenComments > 0 ? null : "AA"),
        nextWorkflowLabel: nextOpenComments > 0 ? "Open / comments to close" : "Closed / auto-accepted",
        nextOpenComments,
        nextPendingFinalAcceptance: nextOpenComments > 0,
        nextWaitingForNextRound: false
      };
    case "OWC":
      return {
        nextResult: totalComments === 0 ? "OWC" : null,
        nextWorkflowLabel: "Open / waiting next round",
        nextOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: true
      };
    case "RJ":
      return {
        nextResult: totalComments === 0 ? "RJ" : null,
        nextWorkflowLabel: "Open / rejected for reinspection",
        nextOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: true
      };
    case "CX":
      return {
        nextResult: "CX",
        nextWorkflowLabel: "Cancelled",
        nextOpenComments: existingOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: false
      };
  }
}

function createSubmittedComments(
  detail: InspectionItemDetailResponse,
  submittedBy: string,
  submittedAt: string,
  draftComments: Array<{ id: string; message: string }>
): InspectionItemComment[] {
  const nextLocalId =
    Math.max(0, ...detail.comments.map((comment) => comment.localId ?? 0)) + 1;

  return draftComments.map((comment, index) => ({
    id: `${detail.id}-comment-${detail.currentRound}-${detail.comments.length + index + 1}`,
    localId: nextLocalId + index,
    roundNumber: detail.currentRound,
    status: "open",
    message: comment.message,
    createdAt: submittedAt,
    createdBy: submittedBy,
    resolvedAt: null,
    resolvedBy: null,
    resolveRemark: null
  }));
}

function createLocalResolvedDetail(
  detail: InspectionItemDetailResponse,
  commentId: string,
  resolvedBy: string,
  remark?: string
): InspectionItemDetailResponse {
  const resolvedAt = new Date().toISOString();
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId && comment.status === "open"
      ? {
          ...comment,
          status: "closed" as const,
          resolvedAt,
          resolvedBy,
          resolveRemark: remark?.trim() || comment.resolveRemark
        }
      : comment
  );
  const nextOpenCommentCount = nextComments.filter((comment) => comment.status === "open").length;
  const totalComments = nextComments.length;
  
  // Rule: if total > 0 and open == 0, resolvedResult = AA
  const shouldBeAA = totalComments > 0 && nextOpenCommentCount === 0 && detail.lastRoundResult !== "CX";

  return {
    ...detail,
    comments: nextComments,
    openCommentCount: nextOpenCommentCount,
    workflowStatus: shouldBeAA
      ? "closed"
      : detail.resolvedResult === "CX"
        ? "cancelled"
        : (nextOpenCommentCount > 0 || detail.waitingForNextRound)
          ? "open"
          : detail.workflowStatus,
    resolvedResult: shouldBeAA ? "AA" : (totalComments === 0 ? detail.lastRoundResult : detail.resolvedResult),
    pendingFinalAcceptance: detail.lastRoundResult === "AA" ? nextOpenCommentCount > 0 : detail.pendingFinalAcceptance,
    version: detail.version + 1
  };
}

function createLocalReopenedDetail(
  detail: InspectionItemDetailResponse,
  commentId: string
): InspectionItemDetailResponse {
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId && comment.status === "closed"
      ? {
          ...comment,
          status: "open" as const,
          resolvedAt: null,
          resolvedBy: null
        }
      : comment
  );
  const nextOpenCommentCount = nextComments.filter((comment) => comment.status === "open").length;

  return {
    ...detail,
    comments: nextComments,
    openCommentCount: nextOpenCommentCount,
    workflowStatus: "open",
    resolvedResult: null,
    version: detail.version + 1
  };
}

function createLocalRemarkDetail(
  detail: InspectionItemDetailResponse,
  commentId: string,
  remark: string
): InspectionItemDetailResponse {
  const nextComments = detail.comments.map((comment) =>
    comment.id === commentId
      ? {
          ...comment,
          resolveRemark: remark.trim() || null
        }
      : comment
  );

  return {
    ...detail,
    comments: nextComments,
    version: detail.version + 1
  };
}

function createLocalSubmissionDetail(input: {
  detail: InspectionItemDetailResponse;
  selectedResult: InspectionResult;
  preview: ReturnType<typeof buildSubmissionPreview>;
  canAddComments: boolean;
  draftComments: Array<{ id: string; message: string }>;
  submittedBy: string;
}): InspectionItemDetailResponse {
  const { detail, selectedResult, preview, canAddComments, draftComments, submittedBy } = input;
  const submittedAt = new Date().toISOString();
  const nextComments =
    canAddComments && draftComments.length > 0
      ? createSubmittedComments(detail, submittedBy, submittedAt, draftComments)
      : [];
  const localToday = new Date().toLocaleDateString("en-CA");
  const hasHistory = detail.roundHistory.length > 0;
  const lastEntryIndex = hasHistory ? detail.roundHistory.length - 1 : -1;
  const lastEntry = hasHistory ? detail.roundHistory[lastEntryIndex] : null;
  // 检查最后一轮提交是否发生在当日
  const lastEntryIsToday = lastEntry && (lastEntry.submittedAt.startsWith(localToday) || lastEntry.actualDate === localToday);

  let nextRoundHistory = [...detail.roundHistory];

  if (lastEntryIsToday) {
     nextRoundHistory[lastEntryIndex] = {
       ...lastEntry,
       submittedResult: selectedResult,
       submittedAt, // 刷新覆盖提交时间为最新时间
       commentIds: [...lastEntry.commentIds, ...nextComments.map(c => c.id)] // 合并新追加的意见
     };
  } else {
     const nextHistoryEntry: InspectionItemDetailResponse["roundHistory"][number] = {
       id: `${detail.id}-round-${detail.currentRound}`,
       roundNumber: detail.currentRound,
       actualDate: detail.actualDate ?? localToday,
       submittedResult: selectedResult,
       submittedAt,
       submittedBy: submittedBy,
       inspectorDisplayName: submittedBy,
       notes: null,
       source: detail.source,
       commentIds: nextComments.map((comment) => comment.id)
     };
     nextRoundHistory.push(nextHistoryEntry);
  }

  return {
    ...detail,
    workflowStatus:
      selectedResult === "CX"
        ? "cancelled"
        : preview.nextResult === "AA" && !preview.nextPendingFinalAcceptance
          ? "closed"
          : preview.nextOpenComments > 0 || preview.nextWaitingForNextRound
            ? "open"
            : "pending",
    resolvedResult: preview.nextResult,
    lastRoundResult: selectedResult,
    openCommentCount: preview.nextOpenComments,
    pendingFinalAcceptance: preview.nextPendingFinalAcceptance,
    waitingForNextRound: preview.nextWaitingForNextRound,
    comments: [...detail.comments, ...nextComments],
    roundHistory: nextRoundHistory,
    version: detail.version + 1
  };
}

function buildActualDate(detail: InspectionItemDetailResponse): string | null {
  return detail.actualDate ?? detail.plannedDate ?? null;
}

function syncDashboardItem(
  listItems: InspectionListItem[],
  detail: InspectionItemDetailResponse
): InspectionListItem[] {
  return listItems.map((item) =>
    item.id === detail.id ? syncListItemWithDetail(item, detail) : item
  );
}

export function Dashboard() {
  const [listItems, setListItems] = useState<InspectionListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listMode, setListMode] = useState<DetailTransportMode>("api");
  const [dataGeneratedAt, setDataGeneratedAt] = useState<string>(new Date().toISOString());
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

  // Load projects
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    async function loadList() {
      setListLoading(true);
      try {
        const response = await fetchInspectionList();
        if (!active) return;
        setListItems(response.items);
        setDataGeneratedAt(response.generatedAt);
        setListMode("api");
        if (response.items.length > 0) {
           setExpandedRowId(response.items[0]?.id ?? null);
        }
      } catch (err) {
        if (!active) return;
        setListMode("api");
        setListItems([]);
        setDataGeneratedAt(new Date().toISOString());
      } finally {
        if (active) setListLoading(false);
      }
    }
    void loadList();
    return () => { active = false; };
  }, []);
  const [selectedResult, setSelectedResult] = useState<InspectionResult>("QCC");
  const [commentText, setCommentText] = useState("");
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const { session } = useAuth();
  // Using dynamic logged-in user to prevent Foreign Key constraints error
  const currentUserId = session?.user.id || "admin";
  const currentUserDisplayName = session?.user.displayName || "Admin";

  const localToday = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const [filterDate, setFilterDate] = useState<string>(localToday);
  const [filterHull, setFilterHull] = useState<string>("ALL");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("ALL");
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);
  const [remarkModalCommentId, setRemarkModalCommentId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");

  const fallbackDetail = undefined;
  const {
    detail: selectedDetail,
    mode,
    loading,
    error,
    submitError,
    submitting,
    refresh,
    applyLocalDetail,
    submit,
    resolveComment,
    addRemark,
    reopenComment
  } = useInspectionDetail({
    inspectionItemId: expandedRowId ?? "",
    fallbackDetail
  });

  const draftComments = useMemo(() => buildCommentDrafts(commentText), [commentText]);
  const canAddComments = selectedResult === "QCC" || selectedResult === "OWC" || selectedResult === "RJ";

  const openCommentCount = selectedDetail?.comments.filter((comment) => comment.status === "open").length ?? 0;
  const hasExistingOpenComments = openCommentCount > 0;

  const preview = selectedDetail
    ? buildSubmissionPreview(selectedDetail, selectedResult, draftComments)
    : null;

  useEffect(() => {
    if (selectedDetail) {
      setSelectedResult(selectedDetail.lastRoundResult ?? "QCC");
    }
  }, [selectedDetail?.id, selectedDetail?.lastRoundResult]);

  // Derived filter options
  const hullOptions = useMemo(() => Array.from(new Set(listItems.map(i => i.hullNumber))).sort(), [listItems]);
  
  // Get effective disciplines from projects configuration
  const disciplineOptions = useMemo(() => {
    // Get unique project codes from list items
    const projectCodes = Array.from(new Set(listItems.map(i => i.projectCode).filter(Boolean)));
    
    // If we have projects loaded, use their disciplines configuration
    if (projects.length > 0 && projectCodes.length > 0) {
      const allDisciplines = new Set<string>();
      
      for (const projectCode of projectCodes) {
        const project = projects.find(p => p.code === projectCode);
        if (project) {
          const projectDisciplines = project.disciplines && project.disciplines.length > 0 
            ? project.disciplines 
            : DISCIPLINES;
          projectDisciplines.forEach(d => allDisciplines.add(d));
        }
      }
      
      return Array.from(allDisciplines).sort();
    }
    
    // Fallback: extract from actual data
    return Array.from(new Set(listItems.map(i => i.discipline))).sort();
  }, [listItems, projects]);

  const displayedItems = listItems.filter(item => {
    if (filterDate && item.plannedDate !== filterDate) return false;
    if (filterHull !== "ALL" && item.hullNumber !== filterHull) return false;
    if (filterDiscipline !== "ALL" && item.discipline !== filterDiscipline) return false;
    return true;
  });

  const acceptCount = displayedItems.filter(item => item.currentResult === "AA" || item.currentResult === "QCC").length;
  const rejectCount = displayedItems.filter(item => item.currentResult === "RJ" || item.currentResult === "OWC").length;
  const todayQueueCount = displayedItems.filter(item => item.workflowStatus === "pending").length;

  const disciplineCounts = displayedItems.reduce((acc, item) => {
    acc[item.discipline] = (acc[item.discipline] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function handleToggleRow(id: string): void {
    if (expandedRowId === id) {
      setExpandedRowId(null);
    } else {
      setExpandedRowId(id);
      setCommentText("");
      setClientNotice(null);
    }
  }

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelectedIds(new Set(displayedItems.map(i => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleSelectRow(e: React.ChangeEvent<HTMLInputElement>, id: string) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.target.checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  async function handleBatchExport() {
    if (selectedIds.size === 0) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: selectedIds.size });
    
    try {
      const itemsToExport = [];
      let idx = 0;
      for (const id of selectedIds) {
        setExportProgress({ current: ++idx, total: selectedIds.size });
        const detail = await fetchInspectionDetail(id);
        if (detail) itemsToExport.push(detail);
      }
      
      if (itemsToExport.length > 0) {
        const { generateBatchZip } = await import("../utils/pdf-generator");
        await generateBatchZip(itemsToExport, `NbIns_Batch_Reports_${filterDate || 'All'}.zip`);
      }
    } catch (err) {
      alert("Batch export failed.");
      console.error(err);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  }

  function handleExportChecklist() {
    generateInspectionChecklistPdf(displayedItems, {
      date: filterDate || 'ALL',
      hull: filterHull === 'ALL' ? 'ALL' : filterHull,
      discipline: filterDiscipline === 'ALL' ? 'ALL' : filterDiscipline
    });
  }

  async function handleDownloadPdf(e: React.MouseEvent, itemId: string) {
    e.stopPropagation();
    alert("Generating report...");
    try {
      const response = await fetchInspectionDetail(itemId);
      if (response) {
        await generateInspectionReport(response);
      }
    } catch (err) {
      alert("Failed to fetch full detail for PDF report.");
    }
  }


  function persistLocalDetail(nextDetail: InspectionItemDetailResponse): void {
    applyLocalDetail(nextDetail);
    setListItems((current) => syncDashboardItem(current, nextDetail));
  }

  function persistResolvedDetail(nextDetail: InspectionItemDetailResponse): void {
    setListItems((current) => syncDashboardItem(current, nextDetail));
  }

  async function handleResolveComment(commentId: string): Promise<void> {
    if (!selectedDetail || resolvingCommentId || submitting) {
      return;
    }

    setClientNotice(null);
    setResolvingCommentId(commentId);

    try {
      if (mode === "api") {
        const nextDetail = await resolveComment(
          commentId,
          {
            resolvedBy: currentUserId,
            expectedVersion: selectedDetail.version
          },
          { mode }
        );
        persistResolvedDetail(nextDetail);
        setClientNotice("Comment resolved.");
      } else {
        const nextDetail = createLocalResolvedDetail(
          selectedDetail,
          commentId,
          currentUserDisplayName
        );
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Comment resolved in demo mode.");
      }
    } catch (resolveRequestError) {
      if (mode === "api" && resolveRequestError instanceof ApiError) {
        if (resolveRequestError.status === 409) {
          setClientNotice("Version conflict. Please try again.");
          await refresh();
          return;
        }
        if (resolveRequestError.status === 404) {
          setClientNotice("Comment not found. It may have been deleted.");
          return;
        }
        if (resolveRequestError.message.toLowerCase().includes("already closed")) {
          setClientNotice("Comment is already closed.");
          return;
        }
      }
      
      if (mode !== "api") {
        const nextDetail = createLocalResolvedDetail(
          selectedDetail,
          commentId,
          currentUserDisplayName
        );
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Comment resolved in demo mode.");
      } else {
        setClientNotice("Failed to resolve comment. Please try again.");
      }
    } finally {
      setResolvingCommentId(null);
    }
  }

  async function handleAddRemark(commentId: string, remark: string): Promise<void> {
    if (!selectedDetail || submitting) return;
    setClientNotice(null);

    try {
      if (mode === "api") {
        const nextDetail = await addRemark(
          commentId,
          { expectedVersion: selectedDetail.version, remark },
          { mode }
        );
        persistResolvedDetail(nextDetail);
        setClientNotice("Remark added.");
      } else {
        const nextDetail = createLocalRemarkDetail(selectedDetail, commentId, remark);
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Remark added in demo mode.");
      }
    } catch (err) {
      if (mode === "api" && err instanceof ApiError && err.status === 409) {
        await refresh();
      }
      setClientNotice("Failed to add remark.");
    }
  }

  async function handleReopenComment(commentId: string): Promise<void> {
    if (!selectedDetail || submitting) return;
    setClientNotice(null);

    try {
      if (mode === "api") {
        const nextDetail = await reopenComment(
          commentId,
          { expectedVersion: selectedDetail.version },
          { mode }
        );
        persistResolvedDetail(nextDetail);
        setClientNotice("Comment reopened.");
      } else {
        const nextDetail = createLocalReopenedDetail(selectedDetail, commentId);
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Comment reopened in demo mode.");
      }
    } catch (err) {
      if (mode === "api" && err instanceof ApiError && err.status === 409) {
        await refresh();
      }
      setClientNotice("Failed to reopen comment.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedDetail || !preview) {
      return;
    }

    const request = {
      result: selectedResult,
      actualDate: buildActualDate(selectedDetail),
      submittedBy: currentUserId,
      inspectorDisplayName: currentUserDisplayName,
      notes: null,
      expectedVersion: selectedDetail.version,
      comments: canAddComments ? draftComments.map((comment) => ({ message: comment.message })) : []
      // Note: Ideal request would also include checking ids format to submit to the API backend
    };

    setClientNotice(null);

    try {
      const nextMode: DetailTransportMode = mode;

      if (nextMode === "api") {
        const nextDetail = await submit(request, { mode: nextMode });
        persistResolvedDetail(nextDetail);
        setClientNotice("Submitted to API successfully.");
      } else {
        const nextDetail = createLocalSubmissionDetail({
          detail: selectedDetail,
          selectedResult,
          preview,
          canAddComments,
          draftComments,
          submittedBy: currentUserDisplayName
        });
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Submission applied in demo mode.");
      }

      setCommentText("");
    } catch (submitRequestError) {
      if (mode === "api" && submitRequestError instanceof ApiError && submitRequestError.status === 409) {
        await refresh();
      }

      if (mode === "api") {
        setClientNotice(null);
        return;
      }

      const nextDetail = createLocalSubmissionDetail({
        detail: selectedDetail,
        selectedResult,
        preview,
        canAddComments,
        draftComments,
        submittedBy: currentUserDisplayName
      });
      persistLocalDetail(nextDetail);
      setCommentText("");
      setClientNotice("API unavailable. Submission applied in demo mode.");
    }
  }

  const listTransportLabel = listMode === "api" ? "LIVE API" : "DEMO FALLBACK";

  return (
    <>
      <main className="workspace">
        <section className="hero">
          <div>
            <p className="eyebrow">INSPECTION WORKSPACE</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h2>{filterDate === localToday ? "TODAY QUEUE" : `HISTORY: ${filterDate}`}</h2>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--nb-border)',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '11px',
                  background: '#fff',
                  cursor: 'pointer',
                  color: 'var(--nb-text)'
                }}
              />
            </div>
          </div>
          <div className="heroMeta">
            <span>UPDATED {new Date(dataGeneratedAt).toLocaleDateString("en-US")}</span>
            <span className={`badge ${listMode === "api" ? "" : "muted"}`}>{listTransportLabel}</span>
            <button 
              type="button" 
              onClick={() => void handleBatchExport()} 
              disabled={isExporting || selectedIds.size === 0}
              style={{
                marginLeft: '12px',
                background: selectedIds.size > 0 ? 'var(--nb-accent)' : '#ffffff',
                color: selectedIds.size > 0 ? '#ffffff' : 'var(--nb-text-muted)',
                border: `1px solid ${selectedIds.size > 0 ? 'var(--nb-accent)' : 'var(--nb-border)'}`,
                boxShadow: selectedIds.size > 0 ? '0 4px 12px rgba(13, 148, 136, 0.18)' : 'none'
              }}
            >
              {isExporting ? `EXPORTING ${exportProgress.current}/${exportProgress.total}...` : `BATCH EXPORT (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={handleExportChecklist}
              disabled={displayedItems.length === 0}
              style={{
                background: displayedItems.length > 0 ? '#0f172a' : '#ffffff',
                color: displayedItems.length > 0 ? '#ffffff' : 'var(--nb-text-muted)',
                border: `1px solid ${displayedItems.length > 0 ? '#0f172a' : 'var(--nb-border)'}`,
                boxShadow: displayedItems.length > 0 ? '0 4px 12px rgba(15, 23, 42, 0.12)' : 'none'
              }}
            >
              EXPORT CHECKLIST ({displayedItems.length})
            </button>
          </div>
        </section>

        <section className="summaryGrid">
          <article className="summaryCard">
            <p>TODAY QUEUE</p>
            <strong>{todayQueueCount.toString().padStart(2, "0")}</strong>
          </article>
          
          <article className="summaryCard">
            <p>DISCIPLINES IN FOCUS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '12px' }}>
               {Object.entries(disciplineCounts).map(([key, val]) => (
                 <span key={key} style={{ fontSize: '10px', background: 'var(--nb-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--nb-border)'}}>
                   {key}: <b style={{ color: 'var(--nb-text)'}}>{val}</b>
                 </span>
               ))}
            </div>
          </article>

          <article className="summaryCard" style={{ borderColor: '#dcfce3', backgroundColor: '#f0fdf4' }}>
            <p style={{ color: '#166534' }}>ACCEPTED (AA & QCC)</p>
            <strong style={{ color: '#15803d' }}>{acceptCount.toString().padStart(2, "0")}</strong>
          </article>

          <article className="summaryCard" style={{ borderColor: '#fee2e2', backgroundColor: '#fef2f2' }}>
            <p style={{ color: '#991b1b' }}>REJECTED (RJ & OWC)</p>
            <strong style={{ color: '#b91c1c' }}>{rejectCount.toString().padStart(2, "0")}</strong>
          </article>
        </section>

        <section className="fullWidthTable">
          <div className="tableTools">
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <p className="eyebrow" style={{ margin: 0 }}>ACTIVE INSPECTIONS ({displayedItems.length})</p>
                <select 
                  className="filterSelect" 
                  value={filterHull} 
                  onChange={(e) => setFilterHull(e.target.value)}
                >
                  <option value="ALL">ALL HULLS</option>
                  {hullOptions.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select 
                  className="filterSelect" 
                  value={filterDiscipline} 
                  onChange={(e) => setFilterDiscipline(e.target.value)}
                >
                  <option value="ALL">ALL DISCIPLINES</option>
                  {disciplineOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
             </div>
          </div>
          <div className="tableWrap">
            <table className="dashboardTable">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '92px' }} />
                <col style={{ width: '108px' }} />
                <col style={{ width: '118px' }} />
                <col style={{ width: '64px' }} />
                <col />
                <col style={{ width: '96px' }} />
                <col style={{ width: '84px' }} />
                <col style={{ width: '64px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="dashboardColCheckbox" style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      style={{ cursor: 'pointer' }}
                      checked={selectedIds.size > 0 && selectedIds.size === displayedItems.length} 
                      onChange={handleSelectAll} 
                    />
                  </th>
                  <th className="dashboardCompactCol">Hull</th>
                  <th className="dashboardCompactCol">Discipline</th>
                  <th className="dashboardCompactCol">Planned Date</th>
                  <th className="dashboardCompactCol">Round</th>
                  <th className="dashboardItemCol">Inspection Item</th>
                  <th className="dashboardCompactCol">Result</th>
                  <th className="dashboardCompactCol">Comments</th>
                  <th className="dashboardColReport" style={{ textAlign: 'center' }}>Report</th>
                </tr>
              </thead>

              <tbody>
                {displayedItems.length > 0 ? displayedItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`record-row ${item.id === expandedRowId ? "isSelected" : ""}`}
                      onClick={() => handleToggleRow(item.id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          style={{ cursor: 'pointer' }}
                          checked={selectedIds.has(item.id)} 
                          onChange={(e) => handleSelectRow(e, item.id)} 
                        />
                      </td>
                      <td>
                        <strong>{item.hullNumber}</strong>
                      </td>
                      <td>{item.discipline}</td>
                      <td>{item.plannedDate}</td>
                      <td>R{item.currentRound}</td>
                      <td>
                        <strong>{item.itemName}</strong>
                      </td>
                      <td>
                        <span className={`resultBadge ${resultTone(item.currentResult)}`}>
                          {item.currentResult ? INSPECTION_RESULT_LABELS[item.currentResult] || item.currentResult : "PENDING"}
                        </span>
                      </td>
                      <td>{item.openComments}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button"
                          title="Generate Report"
                          onClick={(e) => handleDownloadPdf(e, item.id)}
                          style={{
                             background: 'transparent',
                             border: 'none',
                             cursor: 'pointer',
                             padding: '6px',
                             borderRadius: '6px',
                             color: 'var(--nb-text-muted)',
                             transition: 'all 0.2s',
                             display: 'inline-flex',
                             alignItems: 'center',
                             justifyContent: 'center'
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--nb-primary)'; e.currentTarget.style.background = '#f1f5f9'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--nb-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expansion Row */}
                    {expandedRowId === item.id && (
                      <tr className="expansion-row">
                        <td colSpan={9}>
                          <div className="expansion-panel-inner">
                            {loading ? <div className="alert neutral">Loading inspection details...</div> : null}
                            {error ? <div className="alert warning">{error}</div> : null}

                            {selectedDetail ? (
                              <div className="expansionColumns">
                                {/* Left Side: History and Comments */}
                                <div>
                                  <div className="detailHero">
                                    <h3>{selectedDetail.itemName}</h3>
                                    <div className="detailSummaryGrid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                      <div className="infoCard" style={{ flex: 1, padding: '4px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ margin: 0 }}>Hull / Ship</span>
                                        <strong style={{ fontSize: '11px' }}>{selectedDetail.hullNumber} / {selectedDetail.shipName}</strong>
                                      </div>
                                      <div className="infoCard" style={{ flex: 1, padding: '4px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ margin: 0 }}>Discipline</span>
                                        <strong style={{ fontSize: '11px' }}>{selectedDetail.discipline}</strong>
                                      </div>
                                      <div className="infoCard" style={{ flex: 1, padding: '4px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ margin: 0 }}>Round / Inspector</span>
                                        <strong style={{ fontSize: '11px' }}>R{selectedDetail.currentRound} / {selectedDetail.yardQc}</strong>
                                      </div>
                                      <div className="infoCard" style={{ flex: 1, padding: '4px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ margin: 0 }}>Workflow</span>
                                        <strong style={{ fontSize: '11px' }}>{selectedDetail.workflowStatus.toUpperCase()}</strong>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="panel">
                                    <div className="panelHeader">
                                      <p className="eyebrow">ROUND HISTORY</p>
                                    </div>
                                    <div className="timeline" style={{ display: 'flex', flexDirection: 'row', overflowX: 'auto', paddingBottom: '4px', gap: '8px' }}>
                                      {selectedDetail.roundHistory.length > 0 ? (
                                        selectedDetail.roundHistory.map((entry) => (
                                          <div className="timelineItem" key={entry.id} style={{ minWidth: '220px', flexShrink: 0 }}>
                                            <div className="timelineMarker">R{entry.roundNumber}</div>
                                            <div className="timelineContent">
                                              <strong>{entry.submittedResult ? INSPECTION_RESULT_LABELS[entry.submittedResult] || entry.submittedResult : "PENDING"}</strong>
                                              <span>{formatStamp(entry.submittedAt)} by {entry.inspectorDisplayName || entry.submittedBy}</span>
                                              <small>{entry.commentIds.length} comments raised in this round</small>
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="emptyState">No submissions yet. This item is in the pending queue.</div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="panel">
                                    <div className="panelHeader">
                                      <p className="eyebrow">COMMENTS ({openCommentCount} OPEN)</p>
                                    </div>
                                    <div className="commentList">
                                      {selectedDetail.comments.length > 0 ? (
                                        selectedDetail.comments.map((comment) => (
                                        <article className="commentCard" key={comment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                              <strong style={{ 
                                                fontSize: '11px', 
                                                lineHeight: '1.4',
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                                whiteSpace: 'pre-wrap'
                                              }}>{comment.message}</strong>
                                              {comment.resolveRemark && (
                                                <div style={{ 
                                                  marginTop: '4px', 
                                                  padding: '6px 8px', 
                                                  background: '#fef3c7', 
                                                  border: '1px solid #fde68a', 
                                                  borderRadius: '4px',
                                                  fontSize: '10px',
                                                  fontStyle: 'italic',
                                                  color: '#92400e',
                                                  wordBreak: 'break-word',
                                                  overflowWrap: 'break-word',
                                                  whiteSpace: 'pre-wrap'
                                                }}>
                                                  <strong>Remark:</strong> {comment.resolveRemark}
                                                </div>
                                              )}
                                              <div style={{ color: 'var(--nb-text-muted)', fontSize: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                                <span>Raised by {comment.createdBy} at {formatStamp(comment.createdAt)}</span>
                                                {comment.resolvedAt && (
                                                  <>
                                                    <span>•</span>
                                                    <span>Closed by {comment.resolvedBy} at {formatStamp(comment.resolvedAt)}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                              <span style={{ color: 'var(--nb-text-muted)', fontSize: '10px', fontWeight: 800 }}>R{comment.roundNumber}</span>
                                              <span className={`commentStatus ${comment.status}`}>
                                                {commentStatusLabels[comment.status]}
                                              </span>
                                              {comment.status === "open" ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                  <button
                                                    type="button"
                                                    className="commentCheckboxLabel"
                                                    onClick={() => void handleResolveComment(comment.id)}
                                                    disabled={submitting || resolvingCommentId === comment.id}
                                                  >
                                                    {resolvingCommentId === comment.id ? "Resolving..." : "Resolve"}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="commentCheckboxLabel"
                                                    style={comment.resolveRemark ? { 
                                                      background: '#fee2e2', 
                                                      color: '#b91c1c', 
                                                      border: '1px solid #fecaca',
                                                      fontWeight: 700
                                                    } : { 
                                                      background: 'var(--nb-bg)', 
                                                      color: 'var(--nb-text-muted)' 
                                                    }}
                                                    onClick={() => { setRemarkModalCommentId(comment.id); setRemarkText(comment.resolveRemark || ""); }}
                                                    disabled={submitting || resolvingCommentId === comment.id}
                                                  >
                                                    {comment.resolveRemark ? '⚠ Remark' : 'Remark'}
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className="commentCheckboxLabel"
                                                  style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2' }}
                                                  onClick={() => void handleReopenComment(comment.id)}
                                                  disabled={submitting}
                                                >
                                                  Reopen
                                                </button>
                                              )}
                                            </div>
                                          </article>
                                        ))
                                      ) : (
                                        <div className="emptyState">No comments on this block.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right Side: Submission Form */}
                                <div>
                                  <div className="panel" style={{ padding: 0 }}>
                                    <div className="panelHeader" style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                                      <p className="eyebrow" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        SUBMIT INSPECTION RESULT <span className={`badge ${mode === "api" ? "" : "muted"}`} style={{ padding: '2px 4px', fontSize: '9px', fontWeight: 600, display: 'inline-block'}}>{mode === 'api' ? 'API DB' : 'MEM DB'}</span>
                                      </p>
                                      {preview ? <span className="badge">NEXT: {preview.nextWorkflowLabel.toUpperCase()}</span> : null}
                                    </div>

                                    {submitError ? <div className="alert error" style={{ margin: '12px 0' }}>{submitError}</div> : null}
                                    {clientNotice ? <div className="alert success" style={{ margin: '12px 0' }}>{clientNotice}</div> : null}

                                    <form className="submissionForm" onSubmit={(event) => void handleSubmit(event)}>
                                      
                                      <div className="field">
                                        <span>RESULT</span>
                                        <div className="segmentedControl">
                                          {resultOptions.map((result) => (
                                            <label
                                              key={result}
                                              className={selectedResult === result ? "segment active" : "segment"}
                                            >
                                              <input
                                                type="radio"
                                                name="inspection-result"
                                                value={result}
                                                checked={selectedResult === result}
                                                onChange={() => setSelectedResult(result)}
                                                disabled={submitting}
                                              />
                                              <span>{result}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>

                                      {selectedResult === "AA" && hasExistingOpenComments ? (
                                        <div className="alert warning">
                                          AA is allowed, but final acceptance will remain pending until all existing open comments are closed.
                                        </div>
                                      ) : null}

                                      {selectedResult === "CX" ? (
                                        <div className="alert neutral">
                                          Cancelled semantics: this item will be marked cancelled.
                                        </div>
                                      ) : null}

                                      <label className="field">
                                        <span>NEW COMMENTS (ONE PER LINE)</span>
                                        <textarea
                                          value={commentText}
                                          onChange={(event) => setCommentText(event.target.value)}
                                          placeholder={
                                            canAddComments
                                              ? "Allowed for QCC / OWC / RJ."
                                              : "Disabled for AA and CX."
                                          }
                                          disabled={!canAddComments || submitting}
                                        />
                                      </label>

                                      {preview ? (
                                        <div className="previewGrid">
                                          <div className="previewCard">
                                            <span>RESOLVED RESULT</span>
                                            <strong>{preview.nextResult ? preview.nextResult : "PENDING"}</strong>
                                          </div>
                                          <div className="previewCard">
                                            <span>OPEN COMMENTS POST-SUBMIT</span>
                                            <strong>{preview.nextOpenComments}</strong>
                                          </div>
                                        </div>
                                      ) : null}

                                      <button className="submitButton" type="submit" disabled={submitting || loading}>
                                        {submitting ? "SUBMITTING..." : mode === "api" ? "SUBMIT RESULT" : "SUBMIT IN DEMO MODE"}
                                      </button>
                                    </form>
                                  </div>
                                </div>

                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )) : (
                  <tr><td colSpan={8} className="emptyState">No inspections match current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {remarkModalCommentId && (
        <div className="modalOverlay" onClick={() => setRemarkModalCommentId(null)}>
          <div className="modalDialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Add remark to comment</h3>
            <textarea
              className="remarkTextarea"
              placeholder="Enter remark..."
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              rows={4}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="cancelBtn"
                onClick={() => setRemarkModalCommentId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submitBtn"
                disabled={submitting}
                onClick={() => {
                  const commentId = remarkModalCommentId;
                  setRemarkModalCommentId(null);
                  if (commentId) {
                    void handleAddRemark(commentId, remarkText.trim());
                  }
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
