import type { SqlDatabase } from "../platform/sql-database.ts";
import type { ReportSummaryResponse, ReportDisciplineRow } from "@nbins/shared";

/**
 * Aggregates for the Reports page, computed in SQL instead of shipping every
 * inspection item and comment to the browser.
 *
 * Semantics match the former client-side computation in Reports.tsx:
 * - inspections: the current round's plannedDate inside [startDate, endDate].
 *   Reports.tsx parsed plannedDate with date-fns parseISO and tested
 *   isWithinInterval against [startOfDay, endOfDay] of the local period, so a
 *   plannedDate that is a timestamp is an instant (an ISO one with Z/offset is
 *   compared as written; one without a zone is read as the browser's local
 *   time, like parseISO), while a plain YYYY-MM-DD plan date stays a calendar
 *   date compared with the inclusive [startDate, endDate] bounds.
 *   result = COALESCE(resolvedResult, lastRoundResult)
 * - comments: createdAt inside [startAt, endAt] (instants). A createdAt without
 *   a timezone is read as the browser's local time, like date-fns parseISO did;
 *   `tzOffsetMinutes` is the browser's Date#getTimezoneOffset().
 * - comments are the ones GET /observations/inspection-comments returns
 *   (joined to item, creating round, ship and project).
 * - hull / discipline: exact match; discipline key falls back to "UNKNOWN".
 *
 * Known limitation (not fixed here): a historical timestamp without a zone is
 * read with the browser's *current* UTC offset, so a period that crossed a DST
 * transition in the browser's zone can be off by one hour for such rows. A
 * single tzOffsetMinutes cannot express the historical offset.
 */
export interface ReportSummaryFilter {
  /** Projects the caller may see. */
  allowedProjectIds: string[];
  projectId?: string | null;
  startDate: string;
  endDate: string;
  startAt: string;
  endAt: string;
  tzOffsetMinutes: number;
  hull?: string | null;
  discipline?: string | null;
}

function scope(filter: ReportSummaryFilter): { sql: string; params: unknown[] } | null {
  const allowed = filter.projectId
    ? filter.allowedProjectIds.filter((id) => id === filter.projectId)
    : filter.allowedProjectIds;
  if (allowed.length === 0) return null;
  return { sql: `ship."projectId" IN (${allowed.map(() => "?").join(", ")})`, params: [...allowed] };
}

function emptyRow(discipline: string): ReportDisciplineRow {
  return { discipline, total: 0, acceptedAA: 0, qualifiedQCC: 0, rejectedRJ: 0, owc: 0, pending: 0, passedFirstRound: 0, comments: 0 };
}

export async function queryReportSummary(db: SqlDatabase, filter: ReportSummaryFilter): Promise<ReportSummaryResponse> {
  const scoped = scope(filter);
  const empty: ReportSummaryResponse = { hulls: [], disciplines: [], rows: [] };
  if (!scoped) return empty;

  // Dropdown options: every hull / discipline that has items in scope (unfiltered).
  const options = await db
    .prepare(
      `SELECT DISTINCT ship."hullNumber" AS "hull", item."discipline" AS "discipline"
       FROM "inspection_items" AS item
       JOIN "ships" AS ship ON ship."id" = item."shipId"
       WHERE ${scoped.sql}`
    )
    .bind(...scoped.params)
    .all<{ hull: string; discipline: string }>();
  const hulls = [...new Set(options.results.map((row) => String(row.hull)))].sort();
  const disciplines = [...new Set(options.results.map((row) => String(row.discipline)))].sort();

  const offset = Number(filter.tzOffsetMinutes) || 0;
  // date-fns parseISO: "2026-11-01" is local midnight, "2026-11-01 08:00:00" is
  // local time, an ISO string with Z/offset is that instant. Apply the same
  // rule as for comments so a timestamp plannedDate is compared by instant.
  const asInstant = (column: string) => `CASE
      WHEN length(${column}) > 10 AND (substr(${column}, -1) IN ('Z', 'z') OR substr(${column}, -6, 1) IN ('+', '-'))
        THEN julianday(${column})
      ELSE julianday(${column}, '${offset >= 0 ? "+" : "-"}${Math.abs(offset)} minutes')
    END`;
  // Plain YYYY-MM-DD (and a longer string that is not a timestamp) keeps the
  // calendar-date comparison the date filter used; comparisons against NULL
  // (unparseable) are NULL, so those rows fall out just like parseISO's
  // isValid() === false did.
  const itemClauses = [
    scoped.sql,
    `date(substr(round."plannedDate", 1, 10)) IS NOT NULL`,
    `(CASE
        WHEN instr(substr(round."plannedDate", 11), ':') > 0
          THEN (${asInstant(`round."plannedDate"`)} BETWEEN julianday(?) AND julianday(?))
        ELSE substr(round."plannedDate", 1, 10) BETWEEN ? AND ?
      END)`
  ];
  const itemParams: unknown[] = [
    ...scoped.params,
    filter.startAt,
    filter.endAt,
    filter.startDate,
    filter.endDate
  ];
  const commentClauses = [scoped.sql];
  const commentParams: unknown[] = [...scoped.params];
  if (filter.hull) {
    itemClauses.push(`ship."hullNumber" = ?`);
    itemParams.push(filter.hull);
    commentClauses.push(`ship."hullNumber" = ?`);
    commentParams.push(filter.hull);
  }
  if (filter.discipline) {
    itemClauses.push(`item."discipline" = ?`);
    itemParams.push(filter.discipline);
    commentClauses.push(`item."discipline" = ?`);
    commentParams.push(filter.discipline);
  }

  const items = await db
    .prepare(
      `SELECT COALESCE(NULLIF(item."discipline", ''), 'UNKNOWN') AS "discipline",
              COUNT(*) AS "total",
              SUM(CASE WHEN r = 'AA' THEN 1 ELSE 0 END) AS "acceptedAA",
              SUM(CASE WHEN r = 'QCC' THEN 1 ELSE 0 END) AS "qualifiedQCC",
              SUM(CASE WHEN r = 'RJ' THEN 1 ELSE 0 END) AS "rejectedRJ",
              SUM(CASE WHEN r = 'OWC' THEN 1 ELSE 0 END) AS "owc",
              SUM(CASE WHEN r IN ('AA', 'QCC') AND item."currentRound" = 1 THEN 1 ELSE 0 END) AS "passedFirstRound"
       FROM (
         SELECT item.*, COALESCE(item."resolvedResult", item."lastRoundResult") AS r, ship."hullNumber" AS hullNumber
         FROM "inspection_items" AS item
         JOIN "ships" AS ship ON ship."id" = item."shipId"
         JOIN "projects" AS project ON project."id" = ship."projectId"
         JOIN "inspection_rounds" AS round
           ON round."inspectionItemId" = item."id" AND round."roundNumber" = item."currentRound"
         WHERE ${itemClauses.join(" AND ")}
       ) AS item
       GROUP BY 1`
    )
    .bind(...itemParams)
    .all<Record<string, unknown>>();

  // createdAt: ISO with Z/offset is an instant; without a zone it is local time.
  const commentInstant = asInstant(`cm."createdAt"`);
  const comments = await db
    .prepare(
      `SELECT COALESCE(NULLIF(item."discipline", ''), 'UNKNOWN') AS "discipline", COUNT(*) AS "comments"
       FROM "comments" AS cm
       JOIN "inspection_items" AS item ON item."id" = cm."inspectionItemId"
       JOIN "inspection_rounds" AS round ON round."id" = cm."createdInRoundId"
       JOIN "ships" AS ship ON ship."id" = item."shipId"
       JOIN "projects" AS project ON project."id" = ship."projectId"
       WHERE ${commentClauses.join(" AND ")}
         AND ${commentInstant} BETWEEN julianday(?) AND julianday(?)
       GROUP BY 1`
    )
    .bind(...commentParams, filter.startAt, filter.endAt)
    .all<Record<string, unknown>>();

  const byDiscipline = new Map<string, ReportDisciplineRow>();
  for (const row of items.results) {
    const key = String(row.discipline);
    const entry = emptyRow(key);
    entry.total = Number(row.total ?? 0);
    entry.acceptedAA = Number(row.acceptedAA ?? 0);
    entry.qualifiedQCC = Number(row.qualifiedQCC ?? 0);
    entry.rejectedRJ = Number(row.rejectedRJ ?? 0);
    entry.owc = Number(row.owc ?? 0);
    entry.passedFirstRound = Number(row.passedFirstRound ?? 0);
    entry.pending = entry.total - entry.acceptedAA - entry.qualifiedQCC - entry.rejectedRJ - entry.owc;
    byDiscipline.set(key, entry);
  }
  for (const row of comments.results) {
    const key = String(row.discipline);
    const entry = byDiscipline.get(key) ?? emptyRow(key);
    entry.comments = Number(row.comments ?? 0);
    byDiscipline.set(key, entry);
  }

  return {
    hulls,
    disciplines,
    rows: [...byDiscipline.values()].sort((a, b) => a.discipline.localeCompare(b.discipline))
  };
}
