import { ApiError } from './api/client.ts';
import type { ShipRecord } from './api/types.ts';

export interface StagingRow {
  uid: string;
  item: string;
  discipline: string;
  date: string;
  qc: string;
  startAtRound: number;
  shipId?: string;
  hullLabel?: string;
  shipIssue?: string;
}

export function resolveShip(rawHull: string, ships: ShipRecord[], defaultShipId: string) {
  const raw = rawHull.trim();
  if (!raw) {
    const ship = ships.find(s => s.id === defaultShipId);
    return ship ? { shipId: ship.id, hullLabel: ship.hullNumber } : { shipId: '', hullLabel: '', shipIssue: 'Select a ship' };
  }
  const normalizeHull = (value: string) => value.replace(/[\s-]/g, '').toLowerCase();
  const matches = ships.filter(s => normalizeHull(s.hullNumber) === normalizeHull(raw) || s.shipName.toLowerCase() === raw.toLowerCase());
  if (matches.length === 1) return { shipId: matches[0].id, hullLabel: matches[0].hullNumber };
  return { shipId: '', hullLabel: raw, shipIssue: matches.length ? 'Ambiguous ship; confirmation required' : 'Unknown ship; confirmation required' };
}

export function findImportColumns(json: unknown[][]) {
  for (let i = 0; i < Math.min(json.length, 20); i++) {
    const row = json[i];
    if (!Array.isArray(row)) continue;
    let item = -1, date = -1, hull = -1, qc = -1, round = -1;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().replace(/[\s\.]/g, '');
      if (['item', 'itemname', 'inspectionitem', 'inspectionitemname', 'description', 'inspectiondescription', '项目', '检验项目', '检查项目', '内容', '检验内容', '检查内容'].includes(cell)) item = j;
      if (cell.includes('date') || cell.includes('日期') || cell.includes('time') || cell.includes('plan')) date = j;
      if (cell.includes('vs') || cell.includes('hull') || cell.includes('船号') || cell.includes('为') || cell === 'v/s') hull = j;
      if (cell.includes('qc') || cell.includes('检验') || cell.includes('inspector') || cell.includes('质检')) qc = j;
      if (cell.includes('round') || cell.includes('轮次') || cell.includes('start')) round = j;
    }
    if (item !== -1) return { start: i + 1, item, date, hull, qc, round };
  }
  return { start: 0, item: 0, date: -1, hull: -1, qc: 1, round: 2 };
}

export function rowIssues(row: StagingRow, projectId: string, ships: ShipRecord[], disciplines: readonly string[]): string[] {
  const issues: string[] = [];
  if (!row.item.trim()) issues.push('Inspection item is required');
  if (row.shipIssue) issues.push(row.shipIssue);
  else if (!ships.some(s => s.id === row.shipId && s.projectId === projectId)) issues.push('Select a ship in this project');
  if (!disciplines.includes(row.discipline)) issues.push('Discipline is not configured for this project');
  return issues;
}

export function removeRowsByUid(rows: StagingRow[], successful: StagingRow[]): StagingRow[] {
  const ids = new Set(successful.map(row => row.uid));
  return rows.filter(row => !ids.has(row.uid));
}

export interface ImportOutcome {
  succeeded: number;
  remaining: number;
  failedShip?: string;
  error?: string;
  unknown?: boolean;
  cancelled?: boolean;
}

type Request = (payload: { projectId: string; shipId: string; items: Array<{ itemName: string; discipline: string; plannedDate: string; yardQc: string; startAtRound: number }> }) => Promise<{ imported: number }>;

export async function submitStaging(options: {
  projectId: string;
  rows: StagingRow[];
  ships: ShipRecord[];
  disciplines: readonly string[];
  request: Request;
  onSuccess: (rows: StagingRow[]) => void;
  shouldContinue: () => boolean;
}): Promise<ImportOutcome> {
  const { projectId, ships, disciplines, request, onSuccess, shouldContinue } = options;
  const rows = options.rows.map(row => ({ ...row }));
  if (!projectId || !rows.length || rows.some(row => rowIssues(row, projectId, ships, disciplines).length)) {
    throw new Error('The staging queue contains invalid rows.');
  }
  const groups = new Map<string, StagingRow[]>();
  for (const row of rows) {
    const shipId = row.shipId!;
    const group = groups.get(shipId) ?? [];
    group.push(row);
    groups.set(shipId, group);
  }
  let succeeded = 0;
  for (const [shipId, group] of groups) {
    if (!shouldContinue()) return { succeeded, remaining: rows.length - succeeded, cancelled: true };
    try {
      const response = await request({ projectId, shipId, items: group.map(row => ({ itemName: row.item, discipline: row.discipline, plannedDate: row.date, yardQc: row.qc, startAtRound: row.startAtRound })) });
      if (!response || response.imported !== group.length) {
        return { succeeded, remaining: rows.length - succeeded, failedShip: ships.find(s => s.id === shipId)?.hullNumber || shipId, error: `Unexpected imported count (expected ${group.length}, received ${String(response?.imported)}).`, unknown: true };
      }
      succeeded += group.length;
      onSuccess(group);
    } catch (error: unknown) {
      return { succeeded, remaining: rows.length - succeeded, failedShip: ships.find(s => s.id === shipId)?.hullNumber || shipId, error: error instanceof Error ? error.message : String(error), unknown: !(error instanceof ApiError && error.status >= 400 && error.status < 500) };
    }
  }
  return { succeeded, remaining: rows.length - succeeded };
}
