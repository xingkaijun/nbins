/**
 * Which actions the comment modal offers. These mirror the backend checks in
 * packages/api/src/routes/inspections.ts so the UI never offers an action the
 * server would refuse:
 *
 * - highlight  (PUT  /:id/comments/:commentId/highlight): any member of the item's project.
 * - resolve / remark / reopen (PUT .../resolve|remark|reopen): project member, and an
 *   inspector only within their own disciplines (getInspectionWriteBlockReason).
 * - edit content (PUT .../admin): admins only (requireAdmin).
 *
 * Status gating matches the existing inspection detail panel: resolve and the
 * resolve remark are for open comments, reopen is for closed ones.
 */
import { getInspectionWriteBlockReason, type InspectionPermissionUser } from "./inspection-permissions.ts";

export interface CommentPermissionUser extends InspectionPermissionUser {
  role: string;
}

export interface CommentPermissionTarget {
  status: "open" | "closed";
  discipline: string;
}

export interface CommentActions {
  canHighlight: boolean;
  canResolve: boolean;
  canRemark: boolean;
  canReopen: boolean;
  canEditContent: boolean;
  /** Why resolve/remark/reopen are unavailable for this user, when that is the reason. */
  writeBlockReason: string | null;
}

export function getCommentActions(
  user: CommentPermissionUser | null | undefined,
  comment: CommentPermissionTarget
): CommentActions {
  if (!user) {
    return {
      canHighlight: false,
      canResolve: false,
      canRemark: false,
      canReopen: false,
      canEditContent: false,
      writeBlockReason: "Sign in to change this comment."
    };
  }

  const writeBlockReason = getInspectionWriteBlockReason(user, comment.discipline);
  const canWrite = writeBlockReason === null;
  const isOpen = comment.status === "open";

  return {
    canHighlight: true,
    canResolve: canWrite && isOpen,
    canRemark: canWrite && isOpen,
    canReopen: canWrite && !isOpen,
    canEditContent: user.role === "admin",
    writeBlockReason
  };
}

/** Subset of the comment shown in lists and the modal that an API response can change. */
export interface CommentViewLike {
  id: string;
  content: string;
  status: "open" | "closed";
  closedAt: string | null;
  closedBy: string | null;
  resolveRemark: string | null;
}

export interface DetailCommentLike {
  id: string;
  message: string;
  status: "open" | "closed";
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolveRemark: string | null;
}

/**
 * Copies the server's version of one comment (from an inspection detail
 * response) onto a list row, so the list updates without reloading. Returns
 * the row unchanged when the response does not contain that comment.
 */
export function mergeCommentFromDetail<T extends CommentViewLike>(
  view: T,
  detail: { comments: readonly DetailCommentLike[] }
): T {
  const fresh = detail.comments.find((comment) => comment.id === view.id);
  if (!fresh) {
    return view;
  }
  return {
    ...view,
    content: fresh.message,
    status: fresh.status,
    closedAt: fresh.resolvedAt,
    closedBy: fresh.resolvedBy,
    resolveRemark: fresh.resolveRemark
  };
}
