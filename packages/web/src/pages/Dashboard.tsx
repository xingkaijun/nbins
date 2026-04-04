import React, { useEffect, useMemo, useState } from "react";
import {
  COMMENT_STATUSES,
  INSPECTION_RESULTS,
  INSPECTION_RESULT_LABELS,
  type InspectionItemComment,
  type InspectionItemDetailResponse,
  type InspectionListItem,
  type InspectionResult,
  createMockDashboardSnapshot,
  createMockInspectionDetails,
  syncListItemWithDetail
} from "@nbins/shared";
import { ApiError, fetchInspectionList } from "../api";
import { type DetailTransportMode, useInspectionDetail } from "../useInspectionDetail";

const snapshot = createMockDashboardSnapshot();
const initialMockDetails = createMockInspectionDetails();
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
        nextResult: nextOpenComments > 0 ? null : "AA",
        nextWorkflowLabel: nextOpenComments > 0 ? "Open / comments to close" : "Closed / auto-accepted",
        nextOpenComments,
        nextPendingFinalAcceptance: nextOpenComments > 0,
        nextWaitingForNextRound: false
      };
    case "OWC":
      return {
        nextResult: null,
        nextWorkflowLabel: "Open / waiting next round",
        nextOpenComments,
        nextPendingFinalAcceptance: false,
        nextWaitingForNextRound: true
      };
    case "RJ":
      return {
        nextResult: null,
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
  return draftComments.map((comment, index) => ({
    id: `${detail.id}-comment-${detail.currentRound}-${detail.comments.length + index + 1}`,
    localId: detail.comments.length + index + 1,
    roundNumber: detail.currentRound,
    status: "open",
    message: comment.message,
    createdAt: submittedAt,
    createdBy: submittedBy,
    resolvedAt: null,
    resolvedBy: null
  }));
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
  const [listMode, setListMode] = useState<DetailTransportMode>("demo");
  const [dataGeneratedAt, setDataGeneratedAt] = useState<string>(snapshot.generatedAt);

  const [mockDetailsById, setMockDetailsById] =
    useState<Record<string, InspectionItemDetailResponse>>(initialMockDetails);
  
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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
        setListMode("demo");
        setListItems(snapshot.items);
        setDataGeneratedAt(snapshot.generatedAt);
        if (snapshot.items.length > 0) {
           setExpandedRowId(snapshot.items[0]?.id ?? null);
        }
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

  // Default Current User Context
  const defaultUserId = "user-inspector-li"; // 必须存在于 users 表中，避免 Foreign Key 约束报错
  const defaultUserDisplayName = "Active Admin";

  const localToday = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const [filterDate, setFilterDate] = useState<string>(localToday);
  const [filterHull, setFilterHull] = useState<string>("ALL");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("ALL");
  // Closure Tracking
  const [checkedCommentsToClose, setCheckedCommentsToClose] = useState<Set<string>>(new Set());

  const fallbackDetail = expandedRowId ? mockDetailsById[expandedRowId] : undefined;
  const {
    detail: selectedDetail,
    mode,
    loading,
    error,
    submitError,
    submitting,
    refresh,
    applyLocalDetail,
    submit
  } = useInspectionDetail({
    inspectionItemId: expandedRowId ?? "",
    fallbackDetail
  });

  const draftComments = useMemo(() => buildCommentDrafts(commentText), [commentText]);
  const canAddComments = selectedResult === "QCC" || selectedResult === "OWC" || selectedResult === "RJ";
  
  // Note: For preview visualization, we consider checked comments as to-be-closed.
  const existingOpenCommentsArray = selectedDetail?.comments.filter((comment) => comment.status === "open") ?? [];
  const actuallyOpenUnclosed = existingOpenCommentsArray.length - checkedCommentsToClose.size;
  const hasExistingOpenComments = actuallyOpenUnclosed > 0;

  // Calculate customized preview considering marked-to-close comments
  const preview = selectedDetail
    ? (() => {
        const standardPreview = buildSubmissionPreview(selectedDetail, selectedResult, draftComments);
        // Correct the open comment calculation with the closing marks incorporated visually
        const adjustedOpenCount = Math.max(0, standardPreview.nextOpenComments - checkedCommentsToClose.size);
        return {
          ...standardPreview,
          nextOpenComments: adjustedOpenCount,
          nextPendingFinalAcceptance: selectedResult === "AA" ? adjustedOpenCount > 0 : standardPreview.nextPendingFinalAcceptance
        };
      })()
    : null;

  useEffect(() => {
    if (selectedDetail) {
      setSelectedResult(selectedDetail.lastRoundResult ?? "QCC");
      setCheckedCommentsToClose(new Set()); // Sub-form reset
    }
  }, [selectedDetail?.id, selectedDetail?.lastRoundResult]);

  // Derived filter options
  const hullOptions = useMemo(() => Array.from(new Set(snapshot.items.map(i => i.hullNumber))).sort(), []);
  const disciplineOptions = useMemo(() => Array.from(new Set(snapshot.items.map(i => i.discipline))).sort(), []);

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

  function handleToggleCommentStatus(commentId: string) {
    setCheckedCommentsToClose(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }

  function persistLocalDetail(nextDetail: InspectionItemDetailResponse): void {
    setMockDetailsById((current) => ({
      ...current,
      [nextDetail.id]: nextDetail
    }));
    applyLocalDetail(nextDetail);
    setListItems((current) => syncDashboardItem(current, nextDetail));
  }

  function persistResolvedDetail(nextDetail: InspectionItemDetailResponse): void {
    setMockDetailsById((current) => ({
      ...current,
      [nextDetail.id]: nextDetail
    }));
    setListItems((current) => syncDashboardItem(current, nextDetail));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedDetail || !preview) {
      return;
    }

    // Prepare simulated closure modification for local demo
    const mutatedDetailBeforeLocalWrite = { ...selectedDetail };
    if (checkedCommentsToClose.size > 0 && mode !== "api") {
      mutatedDetailBeforeLocalWrite.comments = mutatedDetailBeforeLocalWrite.comments.map(c => {
         if (checkedCommentsToClose.has(c.id)) {
           return { ...c, status: "closed", resolvedAt: new Date().toISOString(), resolvedBy: defaultUserDisplayName };
         }
         return c;
      });
    }

    const request = {
      result: selectedResult,
      actualDate: buildActualDate(selectedDetail),
      submittedBy: defaultUserId,
      inspectorDisplayName: defaultUserDisplayName,
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
          detail: mutatedDetailBeforeLocalWrite,
          selectedResult,
          preview,
          canAddComments,
          draftComments,
          submittedBy: defaultUserDisplayName
        });
        persistLocalDetail(nextDetail);
        setClientNotice("API unavailable. Submission applied in demo mode.");
      }

      setCommentText("");
      setCheckedCommentsToClose(new Set());
    } catch (submitRequestError) {
      if (mode === "api" && submitRequestError instanceof ApiError && submitRequestError.status === 409) {
        await refresh();
      }

      if (mode === "api") {
        setClientNotice(null);
        return;
      }

      const nextDetail = createLocalSubmissionDetail({
        detail: mutatedDetailBeforeLocalWrite,
        selectedResult,
        preview,
        canAddComments,
        draftComments,
        submittedBy: defaultUserDisplayName
      });
      persistLocalDetail(nextDetail);
      setCommentText("");
      setCheckedCommentsToClose(new Set());
      setClientNotice("API unavailable. Submission applied in demo mode.");
    }
  }

  const listTransportLabel = listMode === "api" ? "LIVE API" : "DEMO FALLBACK";

  return (
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
            <button type="button">EXPORT CHECKLIST</button>
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
            <table>
              <thead>
                <tr>
                  <th>Hull</th>
                  <th>Inspection Item</th>
                  <th>Discipline</th>
                  <th>Planned Date</th>
                  <th>Round</th>
                  <th>Result</th>
                  <th>Comments</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Report</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.length > 0 ? displayedItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`record-row ${item.id === expandedRowId ? "isSelected" : ""}`}
                      onClick={() => handleToggleRow(item.id)}
                    >
                      <td>
                        <strong>{item.hullNumber}</strong>
                      </td>
                      <td>
                        <strong>{item.itemName}</strong>
                      </td>
                      <td>{item.discipline}</td>
                      <td>{item.plannedDate}</td>
                      <td>R{item.currentRound}</td>
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
                          onClick={(e) => {
                             e.stopPropagation();
                             alert("TODO: Trigger PDF Generation for " + item.id);
                          }}
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
                        <td colSpan={8}>
                          <div className="expansion-panel-inner">
                            {loading ? <div className="alert neutral">Loading inspection details...</div> : null}
                            {error ? <div className="alert warning">{error}</div> : null}

                            {selectedDetail ? (
                              <div className="expansionColumns">
                                {/* Left Side: History and Comments */}
                                <div>
                                  <div className="detailHero">
                                    <h3>{selectedDetail.itemName}</h3>
                                    <div className="detailSummaryGrid">
                                      <div className="infoCard">
                                        <span>Hull / Ship</span>
                                        <strong>{selectedDetail.hullNumber} / {selectedDetail.shipName}</strong>
                                      </div>
                                      <div className="infoCard">
                                        <span>Discipline</span>
                                        <strong>{selectedDetail.discipline}</strong>
                                      </div>
                                      <div className="infoCard">
                                        <span>Round / Inspector</span>
                                        <strong>R{selectedDetail.currentRound} / {selectedDetail.yardQc}</strong>
                                      </div>
                                      <div className="infoCard">
                                        <span>Workflow</span>
                                        <strong>{selectedDetail.workflowStatus.toUpperCase()}</strong>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="panel">
                                    <div className="panelHeader">
                                      <p className="eyebrow">ROUND HISTORY</p>
                                    </div>
                                    <div className="timeline">
                                      {selectedDetail.roundHistory.length > 0 ? (
                                        selectedDetail.roundHistory.map((entry) => (
                                          <div className="timelineItem" key={entry.id}>
                                            <div className="timelineMarker">R{entry.roundNumber}</div>
                                            <div className="timelineContent">
                                              <strong>{entry.submittedResult ? INSPECTION_RESULT_LABELS[entry.submittedResult] || entry.submittedResult : "PENDING"}</strong>
                                              <span>{formatStamp(entry.submittedAt)} by {entry.submittedBy}</span>
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
                                      <p className="eyebrow">OPINIONS & COMMENTS ({actuallyOpenUnclosed} OPEN)</p>
                                    </div>
                                    <div className="commentList">
                                      {selectedDetail.comments.length > 0 ? (
                                        selectedDetail.comments.map((comment) => (
                                          <article className="commentCard" key={comment.id}>
                                            <div className="commentMeta">
                                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span className={`commentStatus ${comment.status}`}>
                                                  {commentStatusLabels[comment.status]}
                                                </span>
                                                {comment.status === "open" && (
                                                  <label className="commentCheckboxLabel">
                                                    <input 
                                                      type="checkbox" 
                                                      checked={checkedCommentsToClose.has(comment.id)} 
                                                      onChange={() => handleToggleCommentStatus(comment.id)}
                                                    />
                                                    Resolve
                                                  </label>
                                                )}
                                              </div>
                                              <span>R{comment.roundNumber}</span>
                                            </div>
                                            <strong>{comment.message}</strong>
                                            <p>Raised by {comment.createdBy} at {formatStamp(comment.createdAt)}</p>
                                            {comment.resolvedAt && (
                                              <small>Closed by {comment.resolvedBy}</small>
                                            )}
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
  );
}
