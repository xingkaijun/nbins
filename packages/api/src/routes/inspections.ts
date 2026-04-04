import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { InspectionRepository } from "../repositories/inspection-repository.ts";
import { InspectionService } from "../services/inspection-service.ts";

function createInspectionRoutes(): Hono<{ Bindings: Bindings }> {
  const inspectionRoutes = new Hono<{ Bindings: Bindings }>();
  const resolveStorage = createInspectionStorageResolver();

  inspectionRoutes.get("/", async (c) => {
    try {
      const inspectionService = new InspectionService(
        new InspectionRepository(resolveStorage(c.env))
      );
      const snapshot = await inspectionService.listInspections();

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
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

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
        // 简单处理：如果是复检项，初始 currentRound=2，普通为1
        const initialRound = item.isReinspection ? 2 : 1;
        const itemId = crypto.randomUUID();
        const roundId = crypto.randomUUID();

        // 插入检验项
        statements.push(
          db.prepare(
            `INSERT INTO "inspection_items" 
             ("id", "shipId", "itemName", "itemNameNormalized", "discipline", "workflowStatus", "currentRound", "openCommentsCount", "version", "source", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, 1, 'manual', ?, ?)`
          ).bind(
            itemId,
            body.shipId,
            item.itemName,
            item.itemName.toLowerCase().replace(/[^a-z0-9]/g, ""),
            item.discipline,
            initialRound,
            now,
            now
          )
        );

        // 插入对应初始空的主轮次
        statements.push(
          db.prepare(
            `INSERT INTO "inspection_rounds" 
             ("id", "inspectionItemId", "roundNumber", "rawItemName", "plannedDate", "yardQc", "source", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
          ).bind(
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

      await db.batch(statements);

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
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    const detail = await inspectionService.readInspectionItemDetail(c.req.param("id"));

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

  return inspectionRoutes;
}

const inspectionRoutes = createInspectionRoutes();

export { createInspectionRoutes, inspectionRoutes };
