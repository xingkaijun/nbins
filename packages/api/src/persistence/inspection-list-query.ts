import type { SqlDatabase } from "../platform/sql-database.ts";
import type { InspectionListItem, InspectionListStats } from "@nbins/shared";

export type { InspectionListStats };

/**
 * Server-side inspection list: filtering, counting, stats and paging are done
 * in SQL so a request only reads the rows of the page it returns.
 *
 * Semantics match the Dashboard's former client-side filter
 * (packages/web/src/dashboard-filters.ts → filterDashboardItems):
 * - mode "pending": workflowStatus = 'pending'
 * - mode "open-comments": openCommentsCount > 0
 * - mode "date": plannedDate of the current round = date, unless date is ""
 *   (all dates) or a keyword is given (a keyword search looks across dates)
 * - hull / discipline: exact match
 * - keyword: case-insensitive substring of item name, hull, discipline,
 *   current result or yard QC
 */

export type InspectionListMode = "date" | "pending" | "open-comments";

export interface InspectionListFilter {
  /** Projects the caller may see. `null` means no restriction (internal use only). */
  allowedProjectIds: string[] | null;
  projectId?: string | null;
  mode?: InspectionListMode;
  date?: string;
  hull?: string | null;
  discipline?: string | null;
  keyword?: string | null;
}

export interface InspectionListPageResult {
  items: InspectionListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: InspectionListStats;
  hulls?: string[];
  disciplines?: string[];
}

export const MAX_PAGE_SIZE = 200;
export const EXPORT_BATCH_SIZE = 1000;

const LIST_COLUMNS = `
  item."id" AS "id",
  project."code" AS "projectCode",
  project."name" AS "projectName",
  project."owner" AS "projectOwner",
  project."shipyard" AS "projectShipyard",
  project."class" AS "projectClass",
  ship."hullNumber" AS "hullNumber",
  ship."shipName" AS "shipName",
  item."itemName" AS "itemName",
  item."discipline" AS "discipline",
  COALESCE(round."plannedDate", '') AS "plannedDate",
  COALESCE(round."yardQc", '') AS "yardQc",
  COALESCE(item."resolvedResult", item."lastRoundResult") AS "currentResult",
  item."workflowStatus" AS "workflowStatus",
  item."openCommentsCount" AS "openComments",
  item."currentRound" AS "currentRound"`;

const FROM_CLAUSE = `
  FROM "inspection_items" AS item
  JOIN "ships" AS ship ON ship."id" = item."shipId"
  JOIN "projects" AS project ON project."id" = ship."projectId"
  LEFT JOIN "inspection_rounds" AS round
    ON round."inspectionItemId" = item."id" AND round."roundNumber" = item."currentRound"`;

// Stats only need the current round when a filter looks at it (date, keyword);
// skipping that join keeps the counts cheap on large tables.
const STATS_FROM_CLAUSE = `
  FROM "inspection_items" AS item
  JOIN "ships" AS ship ON ship."id" = item."shipId"`;

const ORDER_CLAUSE = `ORDER BY COALESCE(round."plannedDate", ''), ship."hullNumber", item."itemName", item."id"`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildInspectionListWhere(
  filter: InspectionListFilter
): { sql: string; params: unknown[]; needsRound: boolean } | null {
  let needsRound = false;
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.allowedProjectIds !== null) {
    const allowed = filter.projectId
      ? filter.allowedProjectIds.filter((id) => id === filter.projectId)
      : filter.allowedProjectIds;
    if (allowed.length === 0) {
      return null; // nothing visible: caller returns an empty result without querying
    }
    clauses.push(`ship."projectId" IN (${allowed.map(() => "?").join(", ")})`);
    params.push(...allowed);
  } else if (filter.projectId) {
    clauses.push(`ship."projectId" = ?`);
    params.push(filter.projectId);
  }

  const keyword = (filter.keyword ?? "").trim().toLowerCase();
  const mode = filter.mode ?? "date";

  if (mode === "pending") {
    clauses.push(`item."workflowStatus" = 'pending'`);
  } else if (mode === "open-comments") {
    clauses.push(`item."openCommentsCount" > 0`);
  } else if (!keyword && filter.date) {
    needsRound = true;
    clauses.push(`round."plannedDate" = ?`);
    params.push(filter.date);
  }

  if (filter.hull) {
    clauses.push(`ship."hullNumber" = ?`);
    params.push(filter.hull);
  }

  if (filter.discipline) {
    clauses.push(`item."discipline" = ?`);
    params.push(filter.discipline);
  }

  if (keyword) {
    needsRound = true;
    const pattern = `%${escapeLike(keyword)}%`;
    clauses.push(`(
      lower(item."itemName") LIKE ? ESCAPE '\\'
      OR lower(ship."hullNumber") LIKE ? ESCAPE '\\'
      OR lower(item."discipline") LIKE ? ESCAPE '\\'
      OR lower(COALESCE(item."resolvedResult", item."lastRoundResult", '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(round."yardQc", '')) LIKE ? ESCAPE '\\'
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params, needsRound };
}

function emptyStats(): InspectionListStats {
  return { total: 0, pending: 0, accepted: 0, qcRecheck: 0, reinspection: 0, rejected: 0, openComments: 0, byDiscipline: {} };
}

function mapRow(row: Record<string, unknown>): InspectionListItem {
  return {
    id: String(row.id),
    projectCode: String(row.projectCode ?? ""),
    projectName: String(row.projectName ?? ""),
    projectOwner: (row.projectOwner as string | null) ?? null,
    projectShipyard: (row.projectShipyard as string | null) ?? null,
    projectClass: (row.projectClass as string | null) ?? null,
    hullNumber: String(row.hullNumber ?? ""),
    shipName: String(row.shipName ?? ""),
    itemName: String(row.itemName ?? ""),
    discipline: row.discipline as InspectionListItem["discipline"],
    plannedDate: String(row.plannedDate ?? ""),
    yardQc: String(row.yardQc ?? ""),
    currentResult: (row.currentResult as InspectionListItem["currentResult"]) ?? null,
    workflowStatus: row.workflowStatus as InspectionListItem["workflowStatus"],
    openComments: Number(row.openComments ?? 0),
    currentRound: Number(row.currentRound ?? 1)
  };
}

export function normalizePaging(page: unknown, pageSize: unknown, defaultPageSize = 50): { page: number; pageSize: number } {
  const parsedSize = Math.floor(Number(pageSize));
  const size = Number.isFinite(parsedSize) && parsedSize >= 1 ? Math.min(parsedSize, MAX_PAGE_SIZE) : defaultPageSize;
  const parsedPage = Math.floor(Number(page));
  return { page: Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1, pageSize: size };
}

export async function queryInspectionListStats(db: SqlDatabase, filter: InspectionListFilter): Promise<InspectionListStats> {
  const where = buildInspectionListWhere(filter);
  if (!where) return emptyStats();

  const { results } = await db
    .prepare(
      `SELECT item."discipline" AS "discipline",
              COUNT(*) AS "total",
              SUM(CASE WHEN item."workflowStatus" = 'pending' THEN 1 ELSE 0 END) AS "pending",
              SUM(CASE WHEN COALESCE(item."resolvedResult", item."lastRoundResult") = 'AA' THEN 1 ELSE 0 END) AS "accepted",
              SUM(CASE WHEN COALESCE(item."resolvedResult", item."lastRoundResult") = 'QCC' THEN 1 ELSE 0 END) AS "qcRecheck",
              SUM(CASE WHEN COALESCE(item."resolvedResult", item."lastRoundResult") = 'OWC' THEN 1 ELSE 0 END) AS "reinspection",
              SUM(CASE WHEN COALESCE(item."resolvedResult", item."lastRoundResult") = 'RJ' THEN 1 ELSE 0 END) AS "rejected",
              SUM(item."openCommentsCount") AS "openComments"
       ${where.needsRound ? FROM_CLAUSE : STATS_FROM_CLAUSE}
       ${where.sql}
       GROUP BY item."discipline"`
    )
    .bind(...where.params)
    .all<Record<string, unknown>>();

  const stats = emptyStats();
  for (const row of results) {
    const total = Number(row.total ?? 0);
    stats.total += total;
    stats.pending += Number(row.pending ?? 0);
    stats.accepted += Number(row.accepted ?? 0);
    stats.qcRecheck += Number(row.qcRecheck ?? 0);
    stats.reinspection += Number(row.reinspection ?? 0);
    stats.rejected += Number(row.rejected ?? 0);
    stats.openComments += Number(row.openComments ?? 0);
    stats.byDiscipline[String(row.discipline)] = total;
  }
  return stats;
}

export async function queryInspectionListRows(
  db: SqlDatabase,
  filter: InspectionListFilter,
  limit: number,
  offset: number
): Promise<InspectionListItem[]> {
  const where = buildInspectionListWhere(filter);
  if (!where) return [];
  const { results } = await db
    .prepare(`SELECT ${LIST_COLUMNS} ${FROM_CLAUSE} ${where.sql} ${ORDER_CLAUSE} LIMIT ? OFFSET ?`)
    .bind(...where.params, limit, offset)
    .all<Record<string, unknown>>();
  return results.map(mapRow);
}

/** Hull numbers and disciplines available in the scoped project(s), for the filter dropdowns. */
export async function queryInspectionListFacets(
  db: SqlDatabase,
  filter: Pick<InspectionListFilter, "allowedProjectIds" | "projectId">
): Promise<{ hulls: string[]; disciplines: string[] }> {
  const where = buildInspectionListWhere({ allowedProjectIds: filter.allowedProjectIds, projectId: filter.projectId, mode: "date", date: "" });
  if (!where) return { hulls: [], disciplines: [] };
  const shipWhere = where.sql; // only references ship."projectId"
  const hullRows = await db
    .prepare(`SELECT DISTINCT ship."hullNumber" AS "value" FROM "ships" AS ship ${shipWhere} ORDER BY 1`)
    .bind(...where.params)
    .all<{ value: string }>();
  const disciplineRows = await db
    .prepare(
      `SELECT DISTINCT item."discipline" AS "value"
       FROM "ships" AS ship JOIN "inspection_items" AS item ON item."shipId" = ship."id"
       ${shipWhere} ORDER BY 1`
    )
    .bind(...where.params)
    .all<{ value: string }>();
  return {
    hulls: hullRows.results.map((row) => String(row.value)),
    disciplines: disciplineRows.results.map((row) => String(row.value))
  };
}

export async function queryInspectionListPage(
  db: SqlDatabase,
  filter: InspectionListFilter,
  paging: { page: number; pageSize: number },
  options: { facets?: boolean } = {}
): Promise<InspectionListPageResult> {
  const stats = await queryInspectionListStats(db, filter);
  // Hull/discipline options change rarely; clients ask for them once per project.
  const facets = options.facets ? await queryInspectionListFacets(db, filter) : {};
  const pageCount = Math.max(1, Math.ceil(stats.total / paging.pageSize));
  const page = Math.min(Math.max(1, paging.page), pageCount);
  const items = stats.total > 0
    ? await queryInspectionListRows(db, filter, paging.pageSize, (page - 1) * paging.pageSize)
    : [];
  return { items, total: stats.total, page, pageSize: paging.pageSize, pageCount, stats, ...facets };
}

/**
 * Every matching list row, in list order, read in batches of EXPORT_BATCH_SIZE
 * so the server never materialises one huge result set at once: the ordered
 * ids are read once (one sort), then the summary columns batch by batch.
 *
 * The export streams to a client while other requests keep writing, so the
 * first SELECT's ids are only a candidate list: every batch re-applies the
 * same WHERE (project scope, mode, date, hull, discipline, keyword) so a row
 * that moved out of scope or stopped matching after the first batch is dropped
 * instead of being exported with its new, unauthorised content.
 */
export async function* iterateInspectionList(
  db: SqlDatabase,
  filter: InspectionListFilter,
  batchSize = EXPORT_BATCH_SIZE
): AsyncGenerator<InspectionListItem[]> {
  const where = buildInspectionListWhere(filter);
  if (!where) return;
  const ids = (await db
    .prepare(`SELECT item."id" AS "id" ${FROM_CLAUSE} ${where.sql} ${ORDER_CLAUSE}`)
    .bind(...where.params)
    .raw<[string]>()).map((row) => row[0]);

  for (let start = 0; start < ids.length; start += batchSize) {
    const chunk = ids.slice(start, start + batchSize);
    const chunkClause = `item."id" IN (${chunk.map(() => "?").join(", ")})`;
    // `where.sql` is "WHERE ..." (scoped above); apply it to this batch too so
    // rows that no longer match stay out of the export.
    const batchClause = where.sql ? `${chunkClause} AND ${where.sql.replace(/^WHERE /, "")}` : chunkClause;
    const { results } = await db
      .prepare(`SELECT ${LIST_COLUMNS} ${FROM_CLAUSE} WHERE ${batchClause}`)
      .bind(...chunk, ...where.params)
      .all<Record<string, unknown>>();
    const byId = new Map(results.map((row) => [String(row.id), mapRow(row)]));
    // Rows that stopped matching are absent from `results` and drop out here;
    // rows still in scope keep the order of the first pass.
    yield chunk.map((id) => byId.get(id)).filter((row): row is InspectionListItem => row !== undefined);
  }
}
