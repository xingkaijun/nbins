import React, { useEffect, useMemo, useState } from "react";
import { INSPECTION_RESULT_LABELS, type InspectionItemDetailResponse, type InspectionResult } from "@nbins/shared";
import { ApiError } from "../../api";
import { useAuth } from "../../auth-context";
import { useToast } from "../../components/Toast";
import { useSaveState } from "../../hooks/use-save-state";
import { inspectionSavedMessage, saveErrorMessage } from "../../save-state";
import { getInspectionWriteBlockReason } from "../../inspection-permissions";
import { type DetailTransportMode, useInspectionDetail } from "../../useInspectionDetail";
import {
  buildActualDate,
  buildCommentDrafts,
  buildSubmissionPreview,
  createLocalRemarkDetail,
  createLocalReopenedDetail,
  createLocalResolvedDetail,
  createLocalSubmissionDetail
} from "./dashboard-helpers";
import { InspectionDetailPanel } from "./InspectionDetailPanel";

/**
 * All state and actions of one inspection item (load, submit result, resolve /
 * remark / reopen comments) plus the remark dialog.
 *
 * This logic used to live inline in Dashboard.tsx next to the expanded table
 * row. It was moved here unchanged (same permission rules: `canAddComments`
 * only for QCC / OWC / RJ, same optimistic-version handling, same 409/404
 * handling) so the standalone /inspections/:itemId page renders exactly the
 * same behaviour. Backend authorization is still enforced by the API
 * (project membership + inspector discipline check in routes/inspections.ts);
 * the discipline check is mirrored here (inspection-permissions.ts) only to
 * disable the controls up front instead of letting the request fail with 403.
 */
interface InspectionWorkspaceProps {
  inspectionItemId: string;
  /** Called with every detail the user changed (API-confirmed or demo-local). */
  onDetailChange?: (detail: InspectionItemDetailResponse) => void;
  /** Called whenever a (new) detail is available, e.g. to set the document title. */
  onDetailLoaded?: (detail: InspectionItemDetailResponse) => void;
  /** Optional content rendered above the panel once the detail is loaded. */
  renderHeader?: (detail: InspectionItemDetailResponse) => React.ReactNode;
}

export function InspectionWorkspace({
  inspectionItemId,
  onDetailChange,
  onDetailLoaded,
  renderHeader
}: InspectionWorkspaceProps) {
  const { session } = useAuth();
  // Using dynamic logged-in user to prevent Foreign Key constraints error
  const currentUserId = session?.user.id || "admin";
  const currentUserDisplayName = session?.user.displayName || "Admin";

  const [selectedResult, setSelectedResult] = useState<InspectionResult>("QCC");
  const [commentText, setCommentText] = useState("");
  const toast = useToast();
  // Submit button: "Saving…" while the request runs, then "Saved ✓" briefly.
  const submitSave = useSaveState();
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);
  const [remarkModalCommentId, setRemarkModalCommentId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");

  const fallbackDetail = undefined;
  const {
    detail: selectedDetail,
    mode,
    loading,
    error,
    submitting,
    refresh,
    applyLocalDetail,
    submit,
    resolveComment,
    addRemark,
    reopenComment
  } = useInspectionDetail({
    inspectionItemId,
    fallbackDetail
  });

  // Reset transient input when switching to another item.
  useEffect(() => {
    setCommentText("");
    setRemarkModalCommentId(null);
  }, [inspectionItemId]);

  const draftComments = useMemo(() => buildCommentDrafts(commentText), [commentText]);
  const canAddComments = selectedResult === "QCC" || selectedResult === "OWC" || selectedResult === "RJ";

  const openCommentCount = selectedDetail?.comments.filter((comment) => comment.status === "open").length ?? 0;
  const hasExistingOpenComments = openCommentCount > 0;

  const preview = selectedDetail
    ? buildSubmissionPreview(selectedDetail, selectedResult, draftComments)
    : null;

  // Same discipline rule as the API write endpoints (403 for inspectors outside
  // their disciplines). Only used to disable controls; the server stays authoritative.
  const writeBlockedReason = selectedDetail
    ? getInspectionWriteBlockReason(session?.user ?? null, selectedDetail.discipline)
    : null;

  useEffect(() => {
    if (selectedDetail) {
      setSelectedResult(selectedDetail.lastRoundResult ?? "QCC");
    }
  }, [selectedDetail?.id, selectedDetail?.lastRoundResult]);

  useEffect(() => {
    if (selectedDetail) {
      onDetailLoaded?.(selectedDetail);
    }
  }, [selectedDetail, onDetailLoaded]);

  // Close the remark dialog with Escape.
  useEffect(() => {
    if (!remarkModalCommentId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRemarkModalCommentId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [remarkModalCommentId]);

  function persistLocalDetail(nextDetail: InspectionItemDetailResponse): void {
    applyLocalDetail(nextDetail);
    onDetailChange?.(nextDetail);
  }

  function persistResolvedDetail(nextDetail: InspectionItemDetailResponse): void {
    onDetailChange?.(nextDetail);
  }

  const resultLabel = (result: InspectionResult | null | undefined) =>
    result ? INSPECTION_RESULT_LABELS[result] ?? result : null;

  async function handleResolveComment(commentId: string): Promise<void> {
    if (!selectedDetail || resolvingCommentId || submitting || writeBlockedReason) {
      return;
    }

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
        toast.success("Comment closed.");
      } else {
        const nextDetail = createLocalResolvedDetail(
          selectedDetail,
          commentId,
          currentUserDisplayName
        );
        persistLocalDetail(nextDetail);
        toast.info("Comment closed in demo mode (not sent to the server).");
      }
    } catch (resolveRequestError) {
      if (mode === "api" && resolveRequestError instanceof ApiError) {
        if (resolveRequestError.status === 409) {
          toast.error("Someone else changed this item. The latest version is loaded; please try again.");
          await refresh();
          return;
        }
        if (resolveRequestError.status === 404) {
          toast.error("Comment not found. It may have been deleted.");
          return;
        }
        if (resolveRequestError.message.toLowerCase().includes("already closed")) {
          toast.info("Comment is already closed.");
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
        toast.info("Comment closed in demo mode (not sent to the server).");
      } else {
        toast.error(saveErrorMessage("Close comment", resolveRequestError));
      }
    } finally {
      setResolvingCommentId(null);
    }
  }

  async function handleAddRemark(commentId: string, remark: string): Promise<void> {
    if (!selectedDetail || submitting || writeBlockedReason) return;

    try {
      if (mode === "api") {
        const nextDetail = await addRemark(
          commentId,
          { expectedVersion: selectedDetail.version, remark },
          { mode }
        );
        persistResolvedDetail(nextDetail);
        toast.success("Remark saved.");
      } else {
        const nextDetail = createLocalRemarkDetail(selectedDetail, commentId, remark);
        persistLocalDetail(nextDetail);
        toast.info("Remark saved in demo mode (not sent to the server).");
      }
    } catch (err) {
      if (mode === "api" && err instanceof ApiError && err.status === 409) {
        toast.error("Someone else changed this item. The latest version is loaded; please add the remark again.");
        await refresh();
        return;
      }
      toast.error(saveErrorMessage("Save remark", err));
    }
  }

  async function handleReopenComment(commentId: string): Promise<void> {
    if (!selectedDetail || submitting || writeBlockedReason) return;

    try {
      if (mode === "api") {
        const nextDetail = await reopenComment(
          commentId,
          { expectedVersion: selectedDetail.version },
          { mode }
        );
        persistResolvedDetail(nextDetail);
        toast.success("Comment reopened.");
      } else {
        const nextDetail = createLocalReopenedDetail(selectedDetail, commentId);
        persistLocalDetail(nextDetail);
        toast.info("Comment reopened in demo mode (not sent to the server).");
      }
    } catch (err) {
      if (mode === "api" && err instanceof ApiError && err.status === 409) {
        toast.error("Someone else changed this item. The latest version is loaded; please try again.");
        await refresh();
        return;
      }
      toast.error(saveErrorMessage("Reopen comment", err));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedDetail || !preview || writeBlockedReason || submitSave.saving) {
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
    };

    const applyDemoSubmission = () => {
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
      toast.info(inspectionSavedMessage(resultLabel(nextDetail.lastRoundResult ?? selectedResult), { demo: true }));
    };

    const nextMode: DetailTransportMode = mode;

    try {
      await submitSave.run(async () => {
        if (nextMode === "api") {
          const nextDetail = await submit(request, { mode: nextMode });
          persistResolvedDetail(nextDetail);
          setCommentText("");
          toast.success(inspectionSavedMessage(resultLabel(nextDetail.lastRoundResult ?? selectedResult)));
        } else {
          applyDemoSubmission();
        }
      });
    } catch (submitRequestError) {
      if (nextMode === "api") {
        if (submitRequestError instanceof ApiError && submitRequestError.status === 409) {
          toast.error("Someone else saved this item first. The latest version is loaded; check it and submit again.");
          await refresh();
          return;
        }
        toast.error(saveErrorMessage("Submit", submitRequestError));
        return;
      }

      applyDemoSubmission();
    }
  }

  return (
    <>
      {loading ? <div className="alert neutral" role="status">Loading inspection details...</div> : null}
      {error ? (
        <div className="alert warning" role="alert">
          {error}
          {!selectedDetail && !loading
            ? " — the item may not exist, or you are not a member of its project."
            : null}
        </div>
      ) : null}

      {selectedDetail ? (
        <>
          {renderHeader ? renderHeader(selectedDetail) : null}
          <InspectionDetailPanel
            selectedDetail={selectedDetail}
            mode={mode}
            submitting={submitting}
            loading={loading}
            openCommentCount={openCommentCount}
            resolvingCommentId={resolvingCommentId}
            handleResolveComment={handleResolveComment}
            handleReopenComment={handleReopenComment}
            setRemarkModalCommentId={setRemarkModalCommentId}
            setRemarkText={setRemarkText}
            handleSubmit={handleSubmit}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            commentText={commentText}
            setCommentText={setCommentText}
            canAddComments={canAddComments}
            hasExistingOpenComments={hasExistingOpenComments}
            submitState={submitSave.state}
            preview={preview}
            writeBlockedReason={writeBlockedReason}
          />
        </>
      ) : null}

      {remarkModalCommentId && (
        <div className="modalOverlay" onClick={() => setRemarkModalCommentId(null)}>
          <div
            className="modalDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspection-remark-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="inspection-remark-dialog-title" style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Add remark to comment</h3>
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
