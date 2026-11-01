import type { ReportDisciplineRow } from "@nbins/shared";

/**
 * Reports page figures derived from the server's per-discipline aggregates
 * (GET /api/inspections/report-summary). Same figures, order and rounding as
 * the former client-side computation over every item and comment.
 */
export interface ReportInspectionStats {
  total: number;
  acceptedAA: number;
  qualifiedQCC: number;
  rejectedRJ: number;
  owc: number;
  pending: number;
  passed: number;
  passRate: number;
  yield1stTime: number;
}

export interface ReportDisciplineQuality {
  discipline: string;
  total: number;
  acceptedAA: number;
  qualifiedQCC: number;
  pending: number;
  rejectedRJ: number;
  owc: number;
  TotalComments: number;
  passRate: number;
}

export function buildInspectionStats(rows: readonly ReportDisciplineRow[]): ReportInspectionStats {
  const sum = (key: keyof Omit<ReportDisciplineRow, "discipline">) => rows.reduce((acc, row) => acc + row[key], 0);
  const total = sum("total");
  const acceptedAA = sum("acceptedAA");
  const qualifiedQCC = sum("qualifiedQCC");
  const rejectedRJ = sum("rejectedRJ");
  const owc = sum("owc");
  const pending = total - acceptedAA - qualifiedQCC - rejectedRJ - owc;
  const passed = acceptedAA + qualifiedQCC;
  const passed1stTurn = sum("passedFirstRound");
  return {
    total,
    acceptedAA,
    qualifiedQCC,
    rejectedRJ,
    owc,
    pending,
    passed,
    passRate: total > 0 ? (passed / total) * 100 : 0,
    yield1stTime: total > 0 ? (passed1stTurn / total) * 100 : 0
  };
}

export function buildCommentStats(rows: readonly ReportDisciplineRow[]): { total: number; disciplinesWithComments: number } {
  return {
    total: rows.reduce((acc, row) => acc + row.comments, 0),
    disciplinesWithComments: rows.filter((row) => row.comments > 0).length
  };
}

export function buildDisciplineCommentData(rows: readonly ReportDisciplineRow[]): Array<{ discipline: string; TotalComments: number }> {
  return rows
    .filter((row) => row.comments > 0)
    .map((row) => ({ discipline: row.discipline, TotalComments: row.comments }))
    .sort((a, b) => b.TotalComments - a.TotalComments || a.discipline.localeCompare(b.discipline));
}

export function buildDisciplineQualityData(rows: readonly ReportDisciplineRow[]): ReportDisciplineQuality[] {
  return rows
    .filter((row) => row.total > 0 || row.comments > 0)
    .map((row) => ({
      discipline: row.discipline,
      total: row.total,
      acceptedAA: row.acceptedAA,
      qualifiedQCC: row.qualifiedQCC,
      pending: row.pending,
      rejectedRJ: row.rejectedRJ,
      owc: row.owc,
      TotalComments: row.comments,
      passRate: row.total > 0 ? Math.round(((row.acceptedAA + row.qualifiedQCC) / row.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total || b.TotalComments - a.TotalComments || a.discipline.localeCompare(b.discipline));
}
