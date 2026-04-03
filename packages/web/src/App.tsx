import { useEffect, useMemo, useState } from "react";
import {
  COMMENT_STATUSES,
  DISCIPLINE_LABELS,
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
import { ApiError } from "./api";
import { type DetailTransportMode, useInspectionDetail } from "./useInspectionDetail";

const snapshot = createMockDashboardSnapshot();
const initialMockDetails = createMockInspectionDetails();
const navItems = ["Dashboard", "Projects", "Reports", "Import", "Admin"];
const resultOptions = INSPECTION_RESULTS;
const commentStatusLabels = {
  open: "Open",
  closed: "Closed"
} satisfies Record<(typeof COMMENT_STATUSES)[number], string>;

function resultTone(result: InspectionResult | null): string {
  switch (result) {
    case "AA":
      return "result-aa";
    case "QCC":
      return "result-qcc";
    case "OWC":
      return "result-owc";
    case "RJ":
      return "result-rj";
    case "CX":
      return "result-cx";
    default:
      return "result-pending";
  }
}

function formatStamp(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildCommentDrafts(
  commentText: string
): Array<{ id: string; message: string }> {
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
  const actor = submittedBy.trim() || "Inspector Demo";
  const nextComments =
    canAddComments && draftComments.length > 0
      ? createSubmittedComments(detail, actor, submittedAt, draftComments)
      : [];
  const nextHistoryEntry: InspectionItemDetailResponse["roundHistory"][number] = {
    id: `${detail.id}-round-${detail.roundHistory.length + 1}`,
    roundNumber: detail.currentRound,
    actualDate: detail.actualDate,
    submittedResult: selectedResult,
    submittedAt,
    submittedBy: actor,
    inspectorDisplayName: actor,
    notes: null,
    source: detail.source,
    commentIds: nextComments.map((comment) => comment.id)
  };

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
    roundHistory: [...detail.roundHistory, nextHistoryEntry],
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

export function App() {
  const [listItems, setListItems] = useState<InspectionListItem[]>(snapshot.items);
  const [mockDetailsById, setMockDetailsById] =
    useState<Record<string, InspectionItemDetailResponse>>(initialMockDetails);
  const [selectedId, setSelectedId] = useState<string>(snapshot.items[1]?.id ?? snapshot.items[0]?.id ?? "");
  const [selectedResult, setSelectedResult] = useState<InspectionResult>("QCC");
  const [commentText, setCommentText] = useState("");
  const [submittedBy, setSubmittedBy] = useState("Inspector Demo");
  const [clientNotice, setClientNotice] = useState<string | null>(null);

  const fallbackDetail = mockDetailsById[selectedId];
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
    inspectionItemId: selectedId,
    fallbackDetail
  });

  const draftComments = useMemo(() => buildCommentDrafts(commentText), [commentText]);
  const canAddComments = selectedResult === "QCC" || selectedResult === "OWC" || selectedResult === "RJ";
  const hasExistingOpenComments =
    selectedDetail?.comments.some((comment) => comment.status === "open") ?? false;

  const preview = selectedDetail
    ? buildSubmissionPreview(selectedDetail, selectedResult, draftComments)
    : null;

  useEffect(() => {
    setSelectedResult(selectedDetail?.lastRoundResult ?? "QCC");
  }, [selectedDetail?.id, selectedDetail?.lastRoundResult]);

  const summaryCards = [
    { label: "Today Queue", value: listItems.filter((item) => item.workflowStatus === "pending").length.toString().padStart(2, "0") },
    { label: "Completed", value: listItems.filter((item) => item.currentResult === "AA").length.toString().padStart(2, "0") },
    { label: "Open Comments", value: listItems.reduce((count, item) => count + item.openComments, 0).toString().padStart(2, "0") },
    { label: "Reinspection", value: listItems.filter((item) => item.currentResult === "OWC" || item.currentResult === "RJ").length.toString().padStart(2, "0") },
    { label: "Project Progress", value: `${snapshot.summary.projectProgress}%` }
  ];

  function handleSelectItem(id: string): void {
    setSelectedId(id);
    setCommentText("");
    setClientNotice(null);
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

    const actor = submittedBy.trim() || "Inspector Demo";
    const request = {
      result: selectedResult,
      actualDate: buildActualDate(selectedDetail),
      submittedBy: actor,
      inspectorDisplayName: actor,
      notes: null,
      expectedVersion: selectedDetail.version,
      comments: canAddComments ? draftComments.map((comment) => ({ message: comment.message })) : []
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
          submittedBy
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
        submittedBy
      });
      persistLocalDetail(nextDetail);
      setCommentText("");
      setClientNotice("API unavailable. Submission applied in demo mode.");
    }
  }

  const transportLabel = mode === "api" ? "Live API" : "Demo fallback";

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Project Inspection Workspace</p>
          <h1 className="brand">
            NEW BUILDING INSPECTION <span>SYSTEM</span>
          </h1>
        </div>
        <nav className="navPills" aria-label="Primary">
          {navItems.map((item, index) => (
            <a
              key={item}
              className={index === 0 ? "pill active" : "pill"}
              href="/"
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="contextChip">
          <span>Current Project</span>
          <strong>P-001 / Hudong LNG Carrier</strong>
        </div>
      </header>

      <main className="workspace">
        <section className="hero">
          <div>
            <p className="eyebrow">检验工作台 / Inspection Workspace</p>
            <h2>报验明细与提交演示</h2>
          </div>
          <div className="heroMeta">
            <span>Updated {new Date(snapshot.generatedAt).toLocaleDateString("zh-CN")}</span>
            <span className={`badge ${mode === "api" ? "" : "muted"}`}>{transportLabel}</span>
            <button type="button">Export Checklist</button>
          </div>
        </section>

        <section className="summaryGrid">
          {summaryCards.map((card) => (
            <article className="summaryCard" key={card.label}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        <section className="contentGrid">
          <section className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Today Inspection List</p>
                <h3>重点检验项目</h3>
              </div>
              <div className="tableTools">
                <span className="badge">{listItems.length} active items</span>
                <span className="badge muted">Role: inspector</span>
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
                    <th>Result</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {listItems.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedId ? "isSelected" : undefined}
                      onClick={() => handleSelectItem(item.id)}
                    >
                      <td>
                        <div className="cellStack">
                          <strong>{item.hullNumber}</strong>
                          <span>{item.projectCode}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cellStack">
                          <strong>{item.itemName}</strong>
                          <span>{item.projectName}</span>
                        </div>
                      </td>
                      <td>{DISCIPLINE_LABELS[item.discipline]}</td>
                      <td>{item.plannedDate}</td>
                      <td>
                        <span className={`resultBadge ${resultTone(item.currentResult)}`}>
                          {item.currentResult ? INSPECTION_RESULT_LABELS[item.currentResult] : "待检验"}
                        </span>
                      </td>
                      <td>{item.openComments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selectedDetail ? (
            <section className="detailColumn">
              {loading ? <div className="alert neutral">Loading selected inspection detail...</div> : null}
              {error ? <div className="alert warning">{error}</div> : null}
              {submitError ? <div className="alert error">{submitError}</div> : null}
              {clientNotice ? <div className="alert success">{clientNotice}</div> : null}

              <article className="panel detailHero">
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Inspection Item Detail</p>
                    <h3>{selectedDetail.itemName}</h3>
                  </div>
                  <span className={`resultBadge ${resultTone(selectedDetail.resolvedResult ?? selectedDetail.lastRoundResult)}`}>
                    {selectedDetail.resolvedResult
                      ? INSPECTION_RESULT_LABELS[selectedDetail.resolvedResult]
                      : selectedDetail.lastRoundResult
                        ? INSPECTION_RESULT_LABELS[selectedDetail.lastRoundResult]
                        : "待提交"}
                  </span>
                </div>

                <div className="detailSummaryGrid">
                  <div className="infoCard">
                    <span>Hull / Ship</span>
                    <strong>{selectedDetail.hullNumber} / {selectedDetail.shipName}</strong>
                  </div>
                  <div className="infoCard">
                    <span>Project</span>
                    <strong>{selectedDetail.projectCode} / {selectedDetail.projectName}</strong>
                  </div>
                  <div className="infoCard">
                    <span>Discipline</span>
                    <strong>{DISCIPLINE_LABELS[selectedDetail.discipline]}</strong>
                  </div>
                  <div className="infoCard">
                    <span>Round / QC</span>
                    <strong>R{selectedDetail.currentRound} / {selectedDetail.yardQc}</strong>
                  </div>
                </div>

                <div className="statusRail">
                  <div className="statusPill">
                    <span>Workflow</span>
                    <strong>{selectedDetail.workflowStatus}</strong>
                  </div>
                  <div className="statusPill">
                    <span>Open comments</span>
                    <strong>{selectedDetail.openCommentCount}</strong>
                  </div>
                  <div className="statusPill">
                    <span>Planned date</span>
                    <strong>{selectedDetail.plannedDate}</strong>
                  </div>
                  <div className="statusPill">
                    <span>Transport</span>
                    <strong>{transportLabel}</strong>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Round History</p>
                    <h3>报验轮次</h3>
                  </div>
                </div>
                <div className="timeline">
                  {selectedDetail.roundHistory.length > 0 ? (
                    selectedDetail.roundHistory.map((entry) => (
                      <div className="timelineItem" key={entry.id}>
                        <div className="timelineMarker">R{entry.roundNumber}</div>
                        <div className="timelineContent">
                          <strong>{entry.submittedResult ? INSPECTION_RESULT_LABELS[entry.submittedResult] : "Pending"}</strong>
                          <span>{formatStamp(entry.submittedAt)} by {entry.submittedBy}</span>
                          <small>{entry.commentIds.length} comments raised in this round</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="emptyState">No submissions yet. This item is still in the pending queue.</div>
                  )}
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Comments</p>
                    <h3>意见清单</h3>
                  </div>
                  <span className="badge muted">
                    {selectedDetail.comments.length} total / {selectedDetail.openCommentCount} open
                  </span>
                </div>
                <div className="commentList">
                  {selectedDetail.comments.length > 0 ? (
                    selectedDetail.comments.map((comment) => (
                      <article className="commentCard" key={comment.id}>
                        <div className="commentMeta">
                          <span className={`commentStatus ${comment.status}`}>
                            {commentStatusLabels[comment.status]}
                          </span>
                          <span>Round {comment.roundNumber}</span>
                        </div>
                        <strong>{comment.message}</strong>
                        <p>Raised by {comment.createdBy} at {formatStamp(comment.createdAt)}</p>
                        {comment.resolvedAt ? (
                          <small>Closed by {comment.resolvedBy} at {formatStamp(comment.resolvedAt)}</small>
                        ) : (
                          <small>Pending closure before final acceptance.</small>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="emptyState">No comments on this item.</div>
                  )}
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Result Submission</p>
                    <h3>提交检验结论</h3>
                  </div>
                  {preview ? <span className="badge">Next: {preview.nextWorkflowLabel}</span> : null}
                </div>

                <form className="submissionForm" onSubmit={(event) => void handleSubmit(event)}>
                  <label className="field">
                    <span>Submitted By</span>
                    <input
                      value={submittedBy}
                      onChange={(event) => setSubmittedBy(event.target.value)}
                      placeholder="Inspector name"
                      disabled={submitting}
                    />
                  </label>

                  <div className="field">
                    <span>Result</span>
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
                          <span>{INSPECTION_RESULT_LABELS[result]}</span>
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
                      Cancelled semantics: this item will be marked cancelled and no new comments will be added in this submission.
                    </div>
                  ) : null}

                  <label className="field">
                    <span>New Comments</span>
                    <textarea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder={
                        canAddComments
                          ? "One comment per line. Allowed for QCC / OWC / RJ."
                          : "Disabled for AA and CX."
                      }
                      disabled={!canAddComments || submitting}
                    />
                  </label>

                  {!canAddComments ? (
                    <p className="helperText">
                      {selectedResult === "AA"
                        ? "AA disables new comments by design."
                        : "CX records cancellation only and does not add comments."}
                    </p>
                  ) : (
                    <p className="helperText">
                      Each non-empty line creates one open comment in the current round.
                    </p>
                  )}

                  {preview ? (
                    <div className="previewGrid">
                      <div className="previewCard">
                        <span>Resolved Result</span>
                        <strong>{preview.nextResult ? INSPECTION_RESULT_LABELS[preview.nextResult] : "Pending"}</strong>
                      </div>
                      <div className="previewCard">
                        <span>Open Comments After Submit</span>
                        <strong>{preview.nextOpenComments}</strong>
                      </div>
                    </div>
                  ) : null}

                  <button className="submitButton" type="submit" disabled={submitting || loading}>
                    {submitting ? "Submitting..." : mode === "api" ? "Submit Result" : "Submit In Demo Mode"}
                  </button>
                </form>
              </article>
            </section>
          ) : (
            <section className="detailColumn">
              <article className="panel emptyState">
                No inspection detail is available for the selected item.
              </article>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
