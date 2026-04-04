import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { InspectionItemRecord, InspectionRoundRecord } from "../persistence/records.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { InspectionRepository } from "../repositories/inspection-repository.ts";
import { InspectionService } from "../services/inspection-service.ts";
import { isD1Enabled } from "./route-helpers.ts";

function normalizeItemName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createInspectionRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings }> {
  const inspectionRoutes = new Hono<{ Bindings: Bindings }>();

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

      if (isD1Enabled(c.env)) {
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
      }

      const storage = resolveStorage(c.env);
      const snapshot = await storage.read();

      if (!snapshot.ships.some((ship) => ship.id === body.shipId)) {
        return c.json({ ok: false, error: "船舶不存在" }, 400);
      }

      let importedCount = 0;

      for (const item of body.items) {
        const initialRound = item.isReinspection ? 2 : 1;
        const itemId = crypto.randomUUID();
        const roundId = crypto.randomUUID();

        const itemRecord: InspectionItemRecord = {
          id: itemId,
          shipId: body.shipId,
          itemName: item.itemName,
          itemNameNormalized: normalizeItemName(item.itemName),
          discipline: item.discipline as InspectionItemRecord["discipline"],
          workflowStatus: "pending",
          lastRoundResult: null,
          resolvedResult: null,
          currentRound: initialRound,
          openCommentsCount: 0,
          version: 1,
          source: "manual",
          createdAt: now,
          updatedAt: now
        };

        const roundRecord: InspectionRoundRecord = {
          id: roundId,
          inspectionItemId: itemId,
          roundNumber: initialRound,
          rawItemName: item.itemName,
          plannedDate: item.plannedDate || null,
          actualDate: null,
          yardQc: item.yardQc || null,
          result: null,
          inspectedBy: null,
          notes: null,
          source: "manual",
          createdAt: now,
          updatedAt: now
        };

        snapshot.inspectionItems.push(itemRecord);
        snapshot.inspectionRounds.push(roundRecord);
        importedCount++;
      }

      await storage.write(snapshot);

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

    const { resolvedBy, expectedVersion } = body as {
      resolvedBy?: string;
      expectedVersion?: number;
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
        { resolvedBy, expectedVersion }
      );

      return c.json({
        ok: true,
        data: response
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "COMMENT_NOT_FOUND") {
        return c.json({ ok: false, error: "Comment not found" }, 404);
      }

      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") {
        return c.json({ ok: false, error: "Inspection item version conflict" }, 409);
      }

      return c.json({ ok: false, error: message }, 400);
    }
  });

  return inspectionRoutes;
}

const inspectionRoutes = createInspectionRoutes();

export { createInspectionRoutes, inspectionRoutes };
