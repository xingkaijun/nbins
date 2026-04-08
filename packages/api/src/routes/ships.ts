import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { ShipRecord } from "../persistence/records.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { isD1Enabled } from "./route-helpers.ts";

function generateId(): string {
  return crypto.randomUUID();
}

function createShipRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (c) => {
    try {
      const projectId = c.req.query("projectId");
      const status = c.req.query("status");

      if (isD1Enabled(c.env)) {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (projectId) {
          conditions.push('"projectId" = ?');
          params.push(projectId);
        }
        if (status) {
          conditions.push('"status" = ?');
          params.push(status);
        }

        const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
        const result = await c.env.DB!
          .prepare(`SELECT * FROM "ships"${where} ORDER BY "hullNumber" ASC`)
          .bind(...params)
          .all();

        return c.json({ ok: true, data: result.results ?? [] });
      }

      const snapshot = await resolveStorage(c.env).read();
      const ships = snapshot.ships
        .filter((ship) => (!projectId || ship.projectId === projectId) && (!status || ship.status === status))
        .sort((left, right) => left.hullNumber.localeCompare(right.hullNumber));

      return c.json({ ok: true, data: ships });
    } catch (e: any) {
      console.error("GET /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");

      if (isD1Enabled(c.env)) {
        const ship = await c.env.DB!
          .prepare('SELECT * FROM "ships" WHERE "id" = ?')
          .bind(id)
          .first();

        if (!ship) {
          return c.json({ ok: false, error: "船舶不存在" }, 404);
        }

        return c.json({ ok: true, data: ship });
      }

      const snapshot = await resolveStorage(c.env).read();
      const ship = snapshot.ships.find((record) => record.id === id);

      if (!ship) {
        return c.json({ ok: false, error: "船舶不存在" }, 404);
      }

      return c.json({ ok: true, data: ship });
    } catch (e: any) {
      console.error("GET /ships/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", async (c) => {
    try {
      const body = await c.req.json<{
        projectId: string;
        hullNumber: string;
        shipName: string;
        shipType?: string;
      }>();

      if (!body.projectId || !body.hullNumber || !body.shipName) {
        return c.json({ ok: false, error: "projectId, hullNumber, shipName 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const record: ShipRecord = {
        id: generateId(),
        projectId: body.projectId,
        hullNumber: body.hullNumber,
        shipName: body.shipName,
        shipType: body.shipType ?? null,
        status: "building",
        createdAt: now,
        updatedAt: now
      };

      if (isD1Enabled(c.env)) {
        const project = await c.env.DB!
          .prepare('SELECT "id" FROM "projects" WHERE "id" = ?')
          .bind(body.projectId)
          .first();

        if (!project) {
          return c.json({ ok: false, error: `关联项目 '${body.projectId}' 不存在` }, 400);
        }

        await c.env.DB!
          .prepare(
            `INSERT INTO "ships"
             ("id", "projectId", "hullNumber", "shipName", "shipType", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, 'building', ?, ?)`
          )
          .bind(
            record.id,
            record.projectId,
            record.hullNumber,
            record.shipName,
            record.shipType,
            record.createdAt,
            record.updatedAt
          )
          .run();
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();

        if (!snapshot.projects.some((project) => project.id === record.projectId)) {
          return c.json({ ok: false, error: `关联项目 '${body.projectId}' 不存在` }, 400);
        }

        snapshot.ships.push(record);
        await storage.write(snapshot);
      }

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        projectId?: string;
        hullNumber?: string;
        shipName?: string;
        shipType?: string;
        status?: string;
      }>();
      const now = new Date().toISOString();

      if (isD1Enabled(c.env)) {
        const sets: string[] = ['"updatedAt" = ?'];
        const params: unknown[] = [now];

        if (body.projectId !== undefined) sets.push('"projectId" = ?'), params.push(body.projectId);
        if (body.hullNumber !== undefined) sets.push('"hullNumber" = ?'), params.push(body.hullNumber);
        if (body.shipName !== undefined) sets.push('"shipName" = ?'), params.push(body.shipName);
        if (body.shipType !== undefined) sets.push('"shipType" = ?'), params.push(body.shipType);
        if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);

        params.push(id);

        const info = await c.env.DB!
          .prepare(`UPDATE "ships" SET ${sets.join(", ")} WHERE "id" = ?`)
          .bind(...params)
          .run();

        if (info.meta?.changes === 0) {
          return c.json({ ok: false, error: "船舶不存在" }, 404);
        }
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();
        const ship = snapshot.ships.find((record) => record.id === id);

        if (!ship) {
          return c.json({ ok: false, error: "船舶不存在" }, 404);
        }

        if (body.projectId !== undefined) ship.projectId = body.projectId;
        if (body.hullNumber !== undefined) ship.hullNumber = body.hullNumber;
        if (body.shipName !== undefined) ship.shipName = body.shipName;
        if (body.shipType !== undefined) ship.shipType = body.shipType;
        if (body.status === "building" || body.status === "delivered") ship.status = body.status;
        ship.updatedAt = now;

        await storage.write(snapshot);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /ships/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

export { createShipRoutes };
