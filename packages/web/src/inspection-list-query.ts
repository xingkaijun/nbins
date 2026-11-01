/**
 * Query string for the server-paged inspection list
 * (GET /api/inspections?page=&pageSize=&mode=&date=&hull=&discipline=&keyword=).
 * Kept free of imports so node tests can load it directly.
 */
export interface InspectionListQueryInput {
  projectId: string;
  mode: "date" | "pending" | "open-comments";
  date: string;
  hull: string;
  discipline: string;
  keyword: string;
  page: number;
  pageSize: number;
  /** Ask for the hull/discipline dropdown options (once per project). */
  facets?: boolean;
}

export function buildInspectionListParams(input: InspectionListQueryInput, options: { paged?: boolean } = {}): string {
  const params = new URLSearchParams();
  params.set("projectId", input.projectId);
  params.set("mode", input.mode);
  if (input.mode === "date" && input.date) params.set("date", input.date);
  if (input.hull && input.hull !== "ALL") params.set("hull", input.hull);
  if (input.discipline && input.discipline !== "ALL") params.set("discipline", input.discipline);
  const keyword = input.keyword.trim();
  if (keyword) params.set("keyword", keyword);
  if (options.paged !== false) {
    params.set("page", String(Math.max(1, Math.floor(input.page) || 1)));
    params.set("pageSize", String(input.pageSize));
    if (input.facets) params.set("facets", "1");
  }
  return params.toString();
}

/** Identity of a filter set without paging: a change resets the list position. */
export function inspectionListFilterKey(input: InspectionListQueryInput): string {
  return buildInspectionListParams(input, { paged: false });
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}
