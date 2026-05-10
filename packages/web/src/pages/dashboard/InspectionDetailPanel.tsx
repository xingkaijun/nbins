import React from "react";
import {
  type InspectionItemDetailResponse,
  type InspectionResult,
  INSPECTION_RESULTS,
  INSPECTION_RESULT_LABELS
} from "@nbins/shared";
import { commentStatusLabels, formatStamp } from "./dashboard-helpers";
import type { DetailTransportMode } from "../../useInspectionDetail";

interface InspectionDetailPanelProps {
  selectedDetail: InspectionItemDetailResponse;
  mode: DetailTransportMode;
  submitting: boolean;
  loading: boolean;
  openCommentCount: number;
  resolvingCommentId: string | null;
  handleResolveComment: (commentId: string) => void;
  handleReopenComment: (commentId: string) => void;
  setRemarkModalCommentId: (id: string | null) => void;
  setRemarkText: (text: string) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  selectedResult: InspectionResult;
  setSelectedResult: (result: InspectionResult) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  canAddComments: boolean;
  hasExistingOpenComments: boolean;
  submitError: string | null;
  clientNotice: string | null;
  preview: any;
}

export function InspectionDetailPanel({
  selectedDetail,
  mode,
  submitting,
  loading,
  openCommentCount,
  resolvingCommentId,
  handleResolveComment,
  handleReopenComment,
  setRemarkModalCommentId,
  setRemarkText,
  handleSubmit,
  selectedResult,
  setSelectedResult,
  commentText,
  setCommentText,
  canAddComments,
  hasExistingOpenComments,
  submitError,
  clientNotice,
  preview
}: InspectionDetailPanelProps) {
  const resultOptions = INSPECTION_RESULTS;

  return (
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
                          <span>/</span>
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
                          {comment.resolveRemark ? 'Remark!' : 'Remark'}
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
  );
}
