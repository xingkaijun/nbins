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

function generateId(prefix: string): string {
  const uuidPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${uuidPart}`;
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
      const projectId = c.req.query("projectId")?.trim() || undefined;

      if (projectId && !allowedProjectIds.includes(projectId)) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const snapshot = await inspectionService.listInspections(allowedProjectIds, projectId);

      return c.json({
        ok: true,
        data: snapshot
      });
    } catch (e: any) {
      console.error("GET / error:", e);
      return c.json({ ok: false, error: String(e), stack: e?.stack }, 500);
    }
  });

  inspectionRoutes.post("/batch", async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<{
        projectId: string;
        shipId: string;
        items: Array<{
          itemName: string;
          discipline: string;
          plannedDate: string;
          yardQc: string;
          startAtRound?: number;
        }>;
      }>();

      if (!body.projectId || !body.shipId || !Array.isArray(body.items) || body.items.length === 0) {
        return c.json({ ok: false, error: "缺少 projectId、shipId 或 items 列表为空" }, 400);
      }

      // 查询 ship 实际所属的项目
      const shipRow = await c.env.DB!.prepare(
        `SELECT "projectId" FROM "ships" WHERE "id" = ?`
      ).bind(body.shipId).first<{ projectId: string }>();

      if (!shipRow) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      // 验证前端传入的 projectId 与 ship 实际所属项目一致
      if (shipRow.projectId !== body.projectId) {
        return c.json({ ok: false, error: "Ship does not belong to the specified project" }, 400);
      }

      // 权限检查：admin/manager 有完全权限，inspector 需要有项目和项目权限
      if (authUser.role !== "admin" && authUser.role !== "manager") {
        const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
          resolveStorage(c.env),
          authUser
        );
        if (!allowedProjectIds.includes(shipRow.projectId)) {
          return c.json({ ok: false, error: "forbidden" }, 403);
        }

        // 检查专业权限：inspector 只能导入自己有权限的专业
        const userRow = await c.env.DB!.prepare(
          `SELECT "disciplines" FROM "users" WHERE "id" = ?`
        ).bind(authUser.id).first<{ disciplines: string }>();

        if (userRow) {
          let userDisciplines: string[] = [];
          try {
            userDisciplines = JSON.parse(userRow.disciplines || "[]");
          } catch { /* ignore */ }

          // 检查所有导入项的专业是否都在用户权限范围内
          const unauthorizedItems = body.items.filter(
            item => !userDisciplines.includes(item.discipline)
          );
          if (unauthorizedItems.length > 0) {
            const unauthorizedDisciplines = [...new Set(unauthorizedItems.map(i => i.discipline))];
            return c.json({
              ok: false,
              error: `您没有以下专业的权限: ${unauthorizedDisciplines.join(", ")}`
            }, 403);
          }
        }
      }

      const now = new Date().toISOString();

      const statements = [];
      let importedCount = 0;

      for (const item of body.items) {
        const initialRound = [1, 2, 3].includes(item.startAtRound ?? 1) ? (item.startAtRound ?? 1) : 1;
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
    try {
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

      const authUser = c.get("authUser");
      const storage = resolveStorage(c.env);
      const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
        storage,
        authUser
      );
      const detail = await inspectionService.readInspectionItemDetail(
        c.req.param("id"),
        allowedProjectIds
      );
      if (!detail) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (authUser.role === "inspector" && !authUser.disciplines.includes(detail.discipline)) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const response = await inspectionService.resolveComment(
        c.req.param("id"),
        c.req.param("commentId"),
        { resolvedBy, expectedVersion, remark }
      );

      return c.json({ ok: true, data: { item: response } });
    } catch (error) {
      console.error("PUT /:id/comments/:commentId/resolve error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "COMMENT_NOT_FOUND") return c.json({ ok: false, error: "Comment not found" }, 404);
      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") return c.json({ ok: false, error: "Inspection item version conflict" }, 409);
      if (message === "COMMENT_ALREADY_CLOSED") return c.json({ ok: false, error: "Comment is already closed" }, 400);
      return c.json({ ok: false, error: message }, 500);
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

    const authUser = c.get("authUser");
    const storage = resolveStorage(c.env);
    const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
      storage,
      authUser
    );
    const detail = await inspectionService.readInspectionItemDetail(
      c.req.param("id"),
      allowedProjectIds
    );
    if (!detail) {
      return c.json({ ok: false, error: "forbidden" }, 403);
    }
    if (authUser.role === "inspector" && !authUser.disciplines.includes(detail.discipline)) {
      return c.json({ ok: false, error: "forbidden" }, 403);
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

    const authUser = c.get("authUser");
    const storage = resolveStorage(c.env);
    const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
      storage,
      authUser
    );
    const detail = await inspectionService.readInspectionItemDetail(
      c.req.param("id"),
      allowedProjectIds
    );
    if (!detail) {
      return c.json({ ok: false, error: "forbidden" }, 403);
    }
    if (authUser.role === "inspector" && !authUser.disciplines.includes(detail.discipline)) {
      return c.json({ ok: false, error: "forbidden" }, 403);
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

  inspectionRoutes.put("/:id/comments/:commentId/highlight", async (c) => {
    try {
      const authUser = c.get("authUser");
      const commentId = c.req.param("commentId");
      const body = await c.req.json<{ isHighlighted: number }>();
      const now = new Date().toISOString();

      const storage = resolveStorage(c.env);
      const db = storage.db;

      // 获取 comment 所属的 inspection item 和 project
      const comment = await db
        .prepare(
          `SELECT ii."shipId", s."projectId"
           FROM "comments" cm
           INNER JOIN "inspection_items" ii ON ii."id" = cm."inspectionItemId"
           INNER JOIN "ships" s ON s."id" = ii."shipId"
           WHERE cm."id" = ?`
        )
        .bind(commentId)
        .first<{ shipId: string; projectId: string }>();

      if (!comment) {
        return c.json({ ok: false, error: "Comment not found" }, 404);
      }

      // 检查项目权限
      const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(storage, authUser);
      if (!allowedProjectIds.includes(comment.projectId)) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const info = await db
        .prepare(
          `UPDATE "comments"
           SET "isHighlighted" = ?, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .bind(body.isHighlighted, now, commentId)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "Comment not found" }, 404);
      }

      return c.json({ ok: true, data: { id: commentId, isHighlighted: body.isHighlighted } });
    } catch (e: any) {
      console.error("PUT /:id/comments/:commentId/highlight error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
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
      const authUser = c.get("authUser");
      const storage = resolveStorage(c.env);
      const allowedProjectIds = await resolveAllowedProjectIdsForAuthUser(
        storage,
        authUser
      );
      const detail = await inspectionService.readInspectionItemDetail(
        c.req.param("id"),
        allowedProjectIds
      );
      if (!detail) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (authUser.role === "inspector" && !authUser.disciplines.includes(detail.discipline)) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
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

  inspectionRoutes.post("/:id/comments/admin", requireAdmin, async (c) => {
    try {
      const inspectionItemId = c.req.param("id");
      const authUser = c.get("authUser");
      const body = await c.req.json<{
        content: string;
        authorId?: string;
      }>();
      const now = new Date().toISOString();

      if (!body.content) {
        return c.json({ ok: false, error: "Missing content" }, 400);
      }

      // 优先使用前端传入的 authorId，回退到认证用户 ID
      const authorId = body.authorId || authUser.id;

      // 校验 authorId 是否存在于 users 表中
      const authorRow = await c.env.DB!.prepare(`SELECT "id" FROM "users" WHERE "id" = ?`).bind(authorId).first<{ id: string }>();
      if (!authorRow) {
        return c.json({ ok: false, error: `Author user not found: ${authorId}` }, 400);
      }

      // 获取当前 item 的 currentRound 和最大 localId
      const itemRow = await c.env.DB!.prepare(`SELECT "currentRound" FROM "inspection_items" WHERE "id" = ?`).bind(inspectionItemId).first<{ currentRound: number }>();
      if (!itemRow) return c.json({ ok: false, error: "Inspection item not found" }, 404);

      // 获取当前 round 的 id
      const roundRow = await c.env.DB!.prepare(`SELECT "id" FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?`).bind(inspectionItemId, itemRow.currentRound).first<{ id: string }>();
      if (!roundRow) return c.json({ ok: false, error: "Current round not found" }, 404);

      const maxLocalRow = await c.env.DB!.prepare(`SELECT MAX("localId") as maxId FROM "comments" WHERE "inspectionItemId" = ?`).bind(inspectionItemId).first<{ maxId: number }>();
      const nextLocalId = (maxLocalRow?.maxId || 0) + 1;

      const commentId = generateId("comment");

      await c.env.DB!.prepare(
        `INSERT INTO "comments" ("id", "inspectionItemId", "createdInRoundId", "localId", "authorId", "content", "status", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(commentId, inspectionItemId, roundRow.id, nextLocalId, authorId, body.content, now, now).run();

      // 更新 openCommentsCount
      await c.env.DB!.prepare(`UPDATE "inspection_items" SET "openCommentsCount" = "openCommentsCount" + 1 WHERE "id" = ?`).bind(inspectionItemId).run();

      return c.json({ ok: true, data: { id: commentId, localId: nextLocalId, createdAt: now } });
    } catch (e: any) {
      console.error("POST /:id/comments/admin error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  /* ── DELETE an entire inspection item (admin only) ── */
  inspectionRoutes.delete("/:id/admin", requireAdmin, async (c) => {
    try {
      const inspectionItemId = c.req.param("id");

      const itemRow = await c.env.DB!.prepare(`SELECT "id" FROM "inspection_items" WHERE "id" = ?`).bind(inspectionItemId).first<{ id: string }>();
      if (!itemRow) return c.json({ ok: false, error: "Inspection item not found" }, 404);

      // Cascade: delete comments, rounds, then item
      await c.env.DB!.prepare(`DELETE FROM "comments" WHERE "inspectionItemId" = ?`).bind(inspectionItemId).run();
      await c.env.DB!.prepare(`DELETE FROM "inspection_rounds" WHERE "inspectionItemId" = ?`).bind(inspectionItemId).run();
      await c.env.DB!.prepare(`DELETE FROM "inspection_items" WHERE "id" = ?`).bind(inspectionItemId).run();

      return c.json({ ok: true, data: { success: true } });
    } catch (e: any) {
      console.error("DELETE /:id/admin error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  inspectionRoutes.delete("/:id/comments/:commentId/admin", requireAdmin, async (c) => {
    try {
      const inspectionItemId = c.req.param("id");
      const commentId = c.req.param("commentId");

      const commentRow = await c.env.DB!.prepare(`SELECT "status" FROM "comments" WHERE "id" = ? AND "inspectionItemId" = ?`).bind(commentId, inspectionItemId).first<{ status: string }>();
      if (!commentRow) return c.json({ ok: false, error: "Comment not found" }, 404);

      await c.env.DB!.prepare(`DELETE FROM "comments" WHERE "id" = ? AND "inspectionItemId" = ?`).bind(commentId, inspectionItemId).run();

      if (commentRow.status === 'open') {
        await c.env.DB!.prepare(`UPDATE "inspection_items" SET "openCommentsCount" = MAX(0, "openCommentsCount" - 1) WHERE "id" = ?`).bind(inspectionItemId).run();
      }

      return c.json({ ok: true, data: { success: true } });
    } catch (e: any) {
      console.error("DELETE /:id/comments/:commentId/admin error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return inspectionRoutes;
}

const inspectionRoutes = createInspectionRoutes();

export { createInspectionRoutes, inspectionRoutes };
