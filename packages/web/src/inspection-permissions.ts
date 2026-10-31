/**
 * Client-side mirror of the write rules the API enforces on an inspection item.
 *
 * Source of truth is the API (packages/api/src/routes/inspections.ts): every
 * write endpoint used by the inspection page (comment resolve / remark / reopen
 * and the current-round result submit) first checks project membership and then
 * rejects an `inspector` whose `disciplines` do not include the item's
 * discipline with 403 "forbidden". admin / manager / reviewer are not limited by
 * discipline there.
 *
 * The page uses this only to disable the controls up front and explain why, so
 * the user does not fill a form that the server will refuse. It never grants
 * anything the server would not: the server check stays authoritative.
 */

export interface InspectionPermissionUser {
  role: string;
  disciplines?: readonly string[] | null;
}

/** Returns why the user may not change this item, or null when writes are allowed. */
export function getInspectionWriteBlockReason(
  user: InspectionPermissionUser | null | undefined,
  discipline: string
): string | null {
  if (!user) {
    return "Sign in to change this inspection item.";
  }

  if (user.role === "inspector" && !(user.disciplines ?? []).includes(discipline)) {
    return `Read only: your inspector account is not assigned to the ${discipline} discipline.`;
  }

  return null;
}
