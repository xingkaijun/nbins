import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import type { InspectionCommentView } from "@nbins/shared";
import {
  addInspectionCommentRemark,
  fetchInspectionDetail,
  reopenInspectionComment,
  resolveInspectionComment,
  toggleCommentHighlight,
  updateInspectionCommentAdmin
} from "../api";
import { publishInspectionUpdate } from "../inspection-sync";
import { getCommentActions, mergeCommentFromDetail, type CommentPermissionUser } from "../comment-permissions";
import { useToast } from "./Toast";
import { SAVED_FLASH_MS } from "../save-state";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface CommentModalUser extends CommentPermissionUser {
  id: string;
  displayName?: string;
}

interface CommentDetailModalProps {
  comment: InspectionCommentView;
  user: CommentModalUser | null;
  onClose(): void;
  /** Called with the updated row after every successful change. */
  onChange(updated: InspectionCommentView): void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * One inspection comment, and nothing else: its text, author, times, status,
 * the item it belongs to, and the actions this user may take on it. The
 * action rules come from getCommentActions, which mirrors the API checks.
 */
export function CommentDetailModal({ comment, user, onClose, onChange }: CommentDetailModalProps) {
  const toast = useToast();
  const titleId = useId();
  const contextId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Synchronous guard: a second click before React re-renders must not send twice.
  const busyRef = useRef(false);
  // The action that just succeeded shows "Saved ✓" on its button for a moment.
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(comment.content);
  const [remarkDraft, setRemarkDraft] = useState(comment.resolveRemark ?? "");

  const actions = getCommentActions(user, { status: comment.status, discipline: comment.discipline });
  const isOpen = comment.status === "open";
  const remarkChanged = remarkDraft.trim() !== (comment.resolveRemark ?? "").trim();

  useEffect(() => {
    setContentDraft(comment.content);
    setRemarkDraft(comment.resolveRemark ?? "");
    setEditingContent(false);
    setError(null);
    // Only when another comment is shown; edits to this one keep the drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.id]);

  // Focus management: move focus in, keep it in (Tab cycles), give it back on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // After an action the button that had focus can disappear (Close comment ↔ Reopen).
  // Keep focus inside the dialog so Tab and Esc keep working.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (busy === null && dialog && !dialog.contains(document.activeElement)) {
      dialog.focus();
    }
  }, [busy, comment]);

  function handleEscape() {
    if (editingContent) {
      setEditingContent(false);
      setContentDraft(comment.content);
      return;
    }
    onClose();
  }

  // Fallback for Esc when focus has left the dialog (e.g. landed on <body>).
  const escapeRef = useRef(handleEscape);
  escapeRef.current = handleEscape;
  useEffect(() => {
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        escapeRef.current();
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      handleEscape();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function run(label: string, task: () => Promise<InspectionCommentView>, success: string) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(label);
    setError(null);
    try {
      const updated = await task();
      onChange(updated);
      toast.success(success);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setJustSaved(label);
      savedTimerRef.current = setTimeout(() => setJustSaved(null), SAVED_FLASH_MS);
      return true;
    } catch (err) {
      const message = errorText(err, `${label} failed.`);
      setError(message);
      toast.error(`${label} failed: ${message}`);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function withFreshVersion() {
    const detail = await fetchInspectionDetail(comment.inspectionItemId);
    return detail.version;
  }

  function handleResolve() {
    if (!user) return;
    void run("Close comment", async () => {
      const expectedVersion = await withFreshVersion();
      const remark = remarkDraft.trim();
      const response = await resolveInspectionComment(comment.inspectionItemId, comment.id, {
        resolvedBy: user.id,
        expectedVersion,
        ...(remark ? { remark } : {})
      });
      publishInspectionUpdate(response.item);
      return mergeCommentFromDetail(comment, response.item);
    }, `Comment #${comment.localId} closed.`);
  }

  function handleSaveRemark() {
    const remark = remarkDraft.trim();
    if (!remark) {
      setError("Enter a remark first.");
      return;
    }
    void run("Save remark", async () => {
      const expectedVersion = await withFreshVersion();
      const response = await addInspectionCommentRemark(comment.inspectionItemId, comment.id, { expectedVersion, remark });
      publishInspectionUpdate(response.item);
      return mergeCommentFromDetail(comment, response.item);
    }, "Remark saved.");
  }

  function handleReopen() {
    void run("Reopen comment", async () => {
      const expectedVersion = await withFreshVersion();
      const response = await reopenInspectionComment(comment.inspectionItemId, comment.id, { expectedVersion });
      publishInspectionUpdate(response.item);
      return mergeCommentFromDetail(comment, response.item);
    }, `Comment #${comment.localId} reopened.`);
  }

  function handleToggleHighlight() {
    const next = comment.isHighlighted === 1 ? 0 : 1;
    void run("Highlight", async () => {
      await toggleCommentHighlight(comment.inspectionItemId, comment.id, next);
      return { ...comment, isHighlighted: next };
    }, next === 1 ? "Comment highlighted." : "Highlight removed.");
  }

  async function handleSaveContent(event: React.FormEvent) {
    event.preventDefault();
    const content = contentDraft.trim();
    if (!content) {
      setError("Comment text cannot be empty.");
      return;
    }
    const ok = await run("Save comment", async () => {
      await updateInspectionCommentAdmin(comment.inspectionItemId, comment.id, { content });
      return { ...comment, content };
    }, "Comment updated.");
    if (ok) {
      setEditingContent(false);
    }
  }

  let closedByLabel: string | null = null;
  if (comment.closedBy) {
    if (user && comment.closedBy === user.id) closedByLabel = user.displayName ?? null;
    else if (comment.closedBy === comment.authorId) closedByLabel = comment.authorName;
  }

  const disabled = busy !== null;

  return createPortal(
    <div
      className="nbModalBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="nbModal commentModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={contextId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="nbModalHeader">
          <div>
            <p className="eyebrow">Inspection comment</p>
            <h2 id={titleId} className="nbModalTitle">
              Comment #{comment.localId}
              <span className={`statusBadge statusBadge--${comment.status}`}>{isOpen ? "Open" : "Closed"}</span>
            </h2>
          </div>
          <button type="button" className="nbIconButton nbIconButton--ghost" onClick={onClose} aria-label="Close dialog" disabled={disabled}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <p id={contextId} className="commentModalContext">
          <strong>{comment.hullNumber}</strong>
          <span aria-hidden="true">·</span>
          <span>{comment.discipline}</span>
          <span aria-hidden="true">·</span>
          <span>{comment.inspectionItemName}</span>
          <span aria-hidden="true">·</span>
          <span>Round {comment.roundNumber}</span>
        </p>

        <div className="nbModalBody">
          {editingContent ? (
            <form className="commentModalSection" onSubmit={(event) => void handleSaveContent(event)}>
              <label className="nbFieldLabel" htmlFor={`${titleId}-content`}>Comment</label>
              <textarea
                id={`${titleId}-content`}
                className="nbTextarea"
                rows={4}
                value={contentDraft}
                onChange={(event) => setContentDraft(event.target.value)}
                disabled={disabled}
              />
              <div className="commentModalInlineActions">
                <button type="button" className="nbButton" onClick={() => { setEditingContent(false); setContentDraft(comment.content); }} disabled={disabled}>
                  Cancel
                </button>
                <button type="submit" className="nbButton nbButton--primary" disabled={disabled || contentDraft.trim() === comment.content.trim()}>
                  {busy === "Save comment" ? "Saving…" : justSaved === "Save comment" ? "Saved ✓" : "Save comment"}
                </button>
              </div>
            </form>
          ) : (
            <section className="commentModalSection" aria-label="Comment">
              <p className="commentModalText">{comment.content}</p>
              {actions.canEditContent ? (
                <button type="button" className="nbLinkButton" onClick={() => setEditingContent(true)} disabled={disabled}>
                  Edit text
                </button>
              ) : null}
            </section>
          )}

          <dl className="commentModalMeta">
            <div>
              <dt>Author</dt>
              <dd>{comment.authorName || comment.authorId}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatDateTime(comment.createdAt)}</dd>
            </div>
            <div>
              <dt>Closed</dt>
              <dd>
                {comment.closedAt ? formatDateTime(comment.closedAt) : "—"}
                {closedByLabel ? <span className="commentModalMuted"> by {closedByLabel}</span> : null}
              </dd>
            </div>
          </dl>

          <section className="commentModalSection">
            <label className="nbFieldLabel" htmlFor={`${titleId}-remark`}>Resolve remark</label>
            {actions.canRemark ? (
              <textarea
                id={`${titleId}-remark`}
                className="nbTextarea"
                rows={2}
                placeholder="Optional remark, saved with the comment"
                value={remarkDraft}
                onChange={(event) => setRemarkDraft(event.target.value)}
                disabled={disabled}
              />
            ) : (
              <p id={`${titleId}-remark`} className="commentModalRemark">{comment.resolveRemark || "—"}</p>
            )}
          </section>

          {actions.writeBlockReason && user ? (
            <p className="commentModalNote">{actions.writeBlockReason}</p>
          ) : null}
          {error ? <p className="commentModalError" role="alert">{error}</p> : null}
        </div>

        <footer className="nbModalFooter">
          {actions.canHighlight ? (
            <button
              type="button"
              className={`nbButton commentModalStar${comment.isHighlighted === 1 ? " isOn" : ""}`}
              aria-pressed={comment.isHighlighted === 1}
              onClick={handleToggleHighlight}
              disabled={disabled}
            >
              <Star size={14} aria-hidden="true" fill={comment.isHighlighted === 1 ? "currentColor" : "none"} />
              {comment.isHighlighted === 1 ? "Highlighted" : "Highlight"}
            </button>
          ) : null}
          <span className="nbModalFooterSpacer" />
          {actions.canRemark ? (
            <button type="button" className="nbButton" onClick={handleSaveRemark} disabled={disabled || !remarkChanged || !remarkDraft.trim()}>
              {busy === "Save remark" ? "Saving…" : justSaved === "Save remark" ? "Saved ✓" : "Save remark"}
            </button>
          ) : null}
          {actions.canResolve ? (
            <button type="button" className="nbButton nbButton--primary" onClick={handleResolve} disabled={disabled}>
              {busy === "Close comment" ? "Closing…" : "Close comment"}
            </button>
          ) : null}
          {actions.canReopen ? (
            <button type="button" className="nbButton nbButton--warn" onClick={handleReopen} disabled={disabled}>
              {busy === "Reopen comment" ? "Reopening…" : "Reopen"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body
  );
}
