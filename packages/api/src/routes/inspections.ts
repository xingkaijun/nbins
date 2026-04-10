import { Hono } from "hono";
import { createRequireAuth, createRequireRole } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";
import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { InspectionRepository } from "../repositories/inspection-repository.ts";
import { InspectionService } from "../services/inspection-service.ts";
import { resolveAllowedProjectIdsForAuthUser } from "../services/inspection-read-authorization.ts";

function normalizeItemName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createInspectionRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings; Variables: AuthContextVariables }> {
  const inspectionRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContextVariables }>();

  inspectionRoutes.use("*", createRequireAuth());

  // 角色守卫：复用的中间件实例
  const requireAdmin = createRequireRole<{ Bindings: Bindings; Variables: AuthContextVariables }>(["admin"]);
  const requireAdminOrManager = createRequireRole<{ Bindings: Bindings; Variables: AuthContextVariables }>(["admin", "manager"]);

  inspectionRoutes.get("/", async (c) => {
    try {
      const storage = resolveStorage(c.env);
      const inspectionService = new InspectionService(new InspectionRepository(storage));
      const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
        storage,
        c.get("authUser")
      );
      const snapshot = await inspectionService.listInspections(allowedProjectIds);

      return c.json({
        ok: true,
        data: snapshot
      });
    } catch (e: any) {
      console.error("GET / error:", e);
      return c.json({ ok: false, error: String(e), stack: e?.stack }, 500);
    }
  });

  inspectionRoutes.post("/batch", requireAdminOrManager, async (c) => {
    try {
      const body = await c.req.json<{
        projectId: string;
        shipId: string;
        items: Array<{
          itemName: string;
          discipline: string;
          plannedDate: string;
          yardQc: string;
          isReinspection: boolean;
        }>;
      }>();

      if (!body.shipId || !Array.isArray(body.items) || body.items.length === 0) {
        return c.json({ ok: false, error: "缺少 shipId 或 items 列表为空" }, 400);
      }

      const now = new Date().toISOString();

      const statements = [];
      let importedCount = 0;

      for (const item of body.items) {
        const initialRound = item.isReinspection ? 2 : 1;
        const itemId = crypto.randomUUID();
        const roundId = crypto.randomUUID();

        statements.push(
          c.env.DB!
            .prepare(
              `INSERT INTO "inspection_items"
               ("id", "shipId", "itemName", "itemNameNormalized", "discipline", "workflowStatus", "currentRound", "openCommentsCount", "version", "source", "createdAt", "updatedAt")
               VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, 1, 'manual', ?, ?)`
            )
            .bind(
              itemId,
              body.shipId,
              item.itemName,
              normalizeItemName(item.itemName),
              item.discipline,
              initialRound,
              now,
              now
            )
        );

        statements.push(
          c.env.DB!
            .prepare(
              `INSERT INTO "inspection_rounds"
               ("id", "inspectionItemId", "roundNumber", "rawItemName", "plannedDate", "yardQc", "source", "createdAt", "updatedAt")
               VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
            )
            .bind(
              roundId,
              itemId,
              initialRound,
              item.itemName,
              item.plannedDate || null,
              item.yardQc || null,
              now,
              now
            )
        );

        importedCount++;
      }

      await c.env.DB!.batch(statements);

      return c.json({
        ok: true,
        data: { imported: importedCount }
      });
    } catch (e: any) {
      console.error("POST /batch error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  inspectionRoutes.get("/:id", async (c) => {
    const storage = resolveStorage(c.env);
    const inspectionService = new InspectionService(new InspectionRepository(storage));
    const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
      storage,
      c.get("authUser")
    );
    const detail = await inspectionService.readInspectionItemDetail(
      c.req.param("id"),
      allowedProjectIds
    );

    if (!detail) {
      return c.json(
        {
          ok: false,
          error: "Inspection item not found"
        },
        404
      );
    }

    return c.json({
      ok: true,
      data: detail
    });
  });

  inspectionRoutes.put("/:id/comments/:commentId/resolve", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json({ ok: false, error: "Request body must be valid JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "Request body must be an object" }, 400);
    }

    const { resolvedBy, expectedVersion, remark } = body as {
      resolvedBy?: string;
      expectedVersion?: number;
      remark?: string;
    };

    if (!resolvedBy || typeof expectedVersion !== "number") {
      return c.json(
        { ok: false, error: "resolvedBy and expectedVersion are required" },
        400
      );
    }

    try {
      const response = await inspectionService.resolveComment(
        c.req.param("id"),
        c.req.param("commentId"),
        { resolvedBy, expectedVersion, remark }
      );

      return c.json({ ok: true, data: response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "COMMENT_NOT_FOUND") return c.json({ ok: false, error: "Comment not found" }, 404);
      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") return c.json({ ok: false, error: "Inspection item version conflict" }, 409);
      if (message === "COMMENT_ALREADY_CLOSED") return c.json({ ok: false, error: "Comment is already closed" }, 400);
      return c.json({ ok: false, error: message }, 400);
    }
  });

  inspectionRoutes.put("/:id/comments/:commentId/remark", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json({ ok: false, error: "Request body must be valid JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "Request body must be an object" }, 400);
    }

    const { expectedVersion, remark } = body as {
      expectedVersion?: number;
      remark?: string;
    };

    if (typeof expectedVersion !== "number" || typeof remark !== "string") {
      return c.json(
        { ok: false, error: "expectedVersion and remark are required" },
        400
      );
    }

    try {
      const response = await inspectionService.addRemark(
        c.req.param("id"),
        c.req.param("commentId"),
        { expectedVersion, remark }
      );

      return c.json({ ok: true, data: { item: response } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "COMMENT_NOT_FOUND") return c.json({ ok: false, error: "Comment not found" }, 404);
      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") return c.json({ ok: false, error: "Inspection item version conflict" }, 409);
      return c.json({ ok: false, error: message }, 400);
    }
  });

  inspectionRoutes.put("/:id/comments/:commentId/reopen", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json({ ok: false, error: "Request body must be valid JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "Request body must be an object" }, 400);
    }

    const { expectedVersion } = body as { expectedVersion?: number; };

    if (typeof expectedVersion !== "number") {
      return c.json({ ok: false, error: "expectedVersion is required" }, 400);
    }

    try {
      const response = await inspectionService.reopenComment(
        c.req.param("id"),
        c.req.param("commentId"),
        { expectedVersion }
      );

      return c.json({ ok: true, data: { item: response } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "COMMENT_NOT_FOUND") return c.json({ ok: false, error: "Comment not found" }, 404);
      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") return c.json({ ok: false, error: "Inspection item version conflict" }, 409);
      if (message === "COMMENT_ALREADY_OPEN") return c.json({ ok: false, error: "Comment is already open" }, 400);
      return c.json({ ok: false, error: message }, 400);
    }
  });

  inspectionRoutes.put("/:id/rounds/current/result", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json(
        {
          ok: false,
          error: "Request body must be valid JSON"
        },
        400
      );
    }

    if (!body || typeof body !== "object") {
      return c.json(
        {
          ok: false,
          error: "Request body must be an object"
        },
        400
      );
    }

    try {
      const response = await inspectionService.submitInspectionResult(
        c.req.param("id"),
        body as never
      );

      return c.json({
        ok: true,
        data: response
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "INSPECTION_ITEM_NOT_FOUND") {
        return c.json({ ok: false, error: "Inspection item not found" }, 404);
      }

      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") {
        return c.json(
          {
            ok: false,
            error: "Inspection item version conflict"
          },
          409
        );
      }

      return c.json(
        {
          ok: false,
          error: message
        },
        400
      );
    }
  });

  inspectionRoutes.put("/:id/admin/item", requireAdmin, async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        shipId?: string;
        itemName?: string;
        discipline?: string;
        workflowStatus?: string;
        lastRoundResult?: string | null;
        resolvedResult?: string | null;
        currentRound?: number;
        source?: "manual" | "n8n";
      }>();
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];
      if (body.shipId !== undefined) sets.push('"shipId" = ?'), params.push(body.shipId);
      if (body.itemName !== undefined) {
        sets.push('"itemName" = ?'), params.push(body.itemName);
        sets.push('"itemNameNormalized" = ?'), params.push(normalizeItemName(body.itemName));
      }
      if (body.discipline !== undefined) sets.push('"discipline" = ?'), params.push(body.discipline);
      if (body.workflowStatus !== undefined) sets.push('"workflowStatus" = ?'), params.push(body.workflowStatus);
      if (body.lastRoundResult !== undefined) sets.push('"lastRoundResult" = ?'), params.push(body.lastRoundResult);
      if (body.resolvedResult !== undefined) sets.push('"resolvedResult" = ?'), params.push(body.resolvedResult);
      if (body.currentRound !== undefined) sets.push('"currentRound" = ?'), params.push(body.currentRound);
      if (body.source !== undefined) sets.push('"source" = ?'), params.push(body.source);
      params.push(id);
      
      const info = await c.env.DB!.prepare(`UPDATE "inspection_items" SET ${sets.join(", ")} WHERE "id" = ?`).bind(...params).run();
      if (info.meta?.changes === 0) return c.json({ ok: false, error: "Inspection item not found" }, 404);

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /:id/admin/item error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  inspectionRoutes.put("/:id/admin/rounds/current", requireAdmin, async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        rawItemName?: string;
        plannedDate?: string | null;
        actualDate?: string | null;
        yardQc?: string | null;
        result?: string | null;
        inspectedBy?: string | null;
        notes?: string | null;
        source?: "manual" | "n8n";
      }>();
      
      const itemRow = await c.env.DB!.prepare(`SELECT "currentRound" FROM "inspection_items" WHERE "id" = ?`).bind(id).first<{ currentRound: number }>();
      if (!itemRow) return c.json({ ok: false, error: "Inspection item not found" }, 404);
      
      const roundRow = await c.env.DB!.prepare(`SELECT "id" FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?`).bind(id, itemRow.currentRound).first<{ id: string }>();
      if (!roundRow) return c.json({ ok: false, error: "Current round not found" }, 404);
      
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];
      if (body.rawItemName !== undefined) sets.push('"rawItemName" = ?'), params.push(body.rawItemName);
      if (body.plannedDate !== undefined) sets.push('"plannedDate" = ?'), params.push(body.plannedDate);
      if (body.actualDate !== undefined) sets.push('"actualDate" = ?'), params.push(body.actualDate);
      if (body.yardQc !== undefined) sets.push('"yardQc" = ?'), params.push(body.yardQc);
      if (body.result !== undefined) sets.push('"result" = ?'), params.push(body.result);
      if (body.inspectedBy !== undefined) sets.push('"inspectedBy" = ?'), params.push(body.inspectedBy);
      if (body.notes !== undefined) sets.push('"notes" = ?'), params.push(body.notes);
      if (body.source !== undefined) sets.push('"source" = ?'), params.push(body.source);
      params.push(roundRow.id);
      
      const info = await c.env.DB!.prepare(`UPDATE "inspection_rounds" SET ${sets.join(", ")} WHERE "id" = ?`).bind(...params).run();
      if (info.meta?.changes === 0) return c.json({ ok: false, error: "Current round not found" }, 404);

      return c.json({ ok: true, data: { id: roundRow.id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /:id/admin/rounds/current error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  inspectionRoutes.put("/:id/comments/:commentId/admin", requireAdmin, async (c) => {
    try {
      const inspectionItemId = c.req.param("id");
      const commentId = c.req.param("commentId");
      const body = await c.req.json<{
        authorId?: string;
        content?: string;
        status?: "open" | "closed";
        closedBy?: string | null;
        closedAt?: string | null;
      }>();
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];
      if (body.authorId !== undefined) sets.push('"authorId" = ?'), params.push(body.authorId);
      if (body.content !== undefined) sets.push('"content" = ?'), params.push(body.content);
      if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);
      if (body.closedBy !== undefined) sets.push('"closedBy" = ?'), params.push(body.closedBy);
      if (body.closedAt !== undefined) sets.push('"closedAt" = ?'), params.push(body.closedAt);
      params.push(commentId, inspectionItemId);
      
      const info = await c.env.DB!.prepare(`UPDATE "comments" SET ${sets.join(", ")} WHERE "id" = ? AND "inspectionItemId" = ?`).bind(...params).run();
      if (info.meta?.changes === 0) return c.json({ ok: false, error: "Comment not found" }, 404);

      return c.json({ ok: true, data: { id: commentId, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /:id/comments/:commentId/admin error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return inspectionRoutes;
}

const inspectionRoutes = createInspectionRoutes();

export { createInspectionRoutes, inspectionRoutes };
