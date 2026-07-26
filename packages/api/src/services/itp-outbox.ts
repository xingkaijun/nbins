import type { WorkflowStatus } from "@nbins/shared";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export type ItpProgressStatus = "in_progress" | "done" | "not_started";

// 状态映射（与 ITP 侧约定一致）：
// pending/open（含复检、待整改）→ in_progress；closed → done；cancelled → not_started
export function mapWorkflowStatusToItp(status: WorkflowStatus): ItpProgressStatus {
  if (status === "closed") {
    return "done";
  }
  if (status === "cancelled") {
    return "not_started";
  }
  return "in_progress";
}

/**
 * 生成 outbox 插入语句，供调用方放进与状态变更同一个 D1 batch，保证原子性。
 * 用 INSERT...SELECT 现场联出 projectCode/hullNumber；
 * 检验项没有 itpCode 时 SELECT 无行，自然不产生事件。
 */
export function buildItpOutboxStatement(
  db: D1Database,
  inspectionItemId: string,
  itpStatus: ItpProgressStatus,
  detail: Record<string, unknown>
): D1PreparedStatement {
  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO "sync_outbox"
         ("createdAt", "eventType", "projectCode", "hullNumber", "itpCode", "itpStatus", "inspectionItemId", "detail")
       SELECT ?, 'inspection_status', p."code", s."hullNumber", i."itpCode", ?, i."id", ?
       FROM "inspection_items" i
       JOIN "ships" s ON s."id" = i."shipId"
       JOIN "projects" p ON p."id" = s."projectId"
       WHERE i."id" = ? AND i."itpCode" IS NOT NULL AND TRIM(i."itpCode") <> ''`
    )
    .bind(now, itpStatus, JSON.stringify(detail), inspectionItemId);
}
