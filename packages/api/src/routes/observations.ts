import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { ObservationRecord } from "../persistence/records.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { isD1Enabled, mockObservations } from "./route-helpers.ts";

function generateId(): string {
  return crypto.randomUUID();
}

function createObservationRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  async function readAuthorName(authorId: string, bindings: Bindings): Promise<string | undefined> {
    const snapshot = await resolveStorage(bindings).read();
    return snapshot.users.find((user) => user.id === authorId)?.displayName;
  }

  routes.get("/ships/:shipId/observations", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const type = c.req.query("type");
      const discipline = c.req.query("discipline");
      const status = c.req.query("status");
      const dateFrom = c.req.query("date_from");
      const dateTo = c.req.query("date_to");

      if (isD1Enabled(c.env)) {
        let sql = `
          SELECT o.*, u."displayName" AS "authorName"
          FROM "observations" o
          LEFT JOIN "users" u ON u."id" = o."authorId"
          WHERE o."shipId" = ?
        `;
        const params: unknown[] = [shipId];

        if (type) {
          sql += ` AND o."type" = ?`;
          params.push(type);
        }
        if (discipline) {
          sql += ` AND o."discipline" = ?`;
          params.push(discipline);
        }
        if (status) {
          sql += ` AND o."status" = ?`;
          params.push(status);
        }
        if (dateFrom) {
          sql += ` AND o."date" >= ?`;
          params.push(dateFrom);
        }
        if (dateTo) {
          sql += ` AND o."date" <= ?`;
          params.push(dateTo);
        }

        sql += ` ORDER BY o."date" DESC, o."createdAt" DESC`;

        const result = await c.env.DB!.prepare(sql).bind(...params).all();
        return c.json({ ok: true, data: result.results ?? [] });
      }

      const items = await Promise.all(
        mockObservations
          .filter(
            (item) =>
              item.shipId === shipId &&
              (!type || item.type === type) &&
              (!discipline || item.discipline === discipline) &&
              (!status || item.status === status) &&
              (!dateFrom || item.date >= dateFrom) &&
              (!dateTo || item.date <= dateTo)
          )
          .sort(
            (left, right) =>
              right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)
          )
          .map(async (item) => ({
            ...item,
            authorName: await readAuthorName(item.authorId, c.env)
          }))
      );

      return c.json({ ok: true, data: items });
    } catch (e: any) {
      console.error("GET /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/ships/:shipId/observations", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const body = await c.req.json<{
        type: string;
        discipline: string;
        authorId: string;
        date: string;
        content: string;
      }>();

      if (!body.type || !body.discipline || !body.content || !body.date) {
        return c.json({ ok: false, error: "type, discipline, date, content 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const record: ObservationRecord = {
        id: generateId(),
        shipId,
        type: body.type,
        discipline: body.discipline as ObservationRecord["discipline"],
        authorId: body.authorId || "sys-user",
        date: body.date,
        content: body.content,
        status: "open",
        closedBy: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now
      };

      if (isD1Enabled(c.env)) {
        await c.env.DB!
          .prepare(
            `INSERT INTO "observations"
             ("id", "shipId", "type", "discipline", "authorId", "date", "content", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
          )
          .bind(
            record.id,
            record.shipId,
            record.type,
            record.discipline,
            record.authorId,
            record.date,
            record.content,
            record.createdAt,
            record.updatedAt
          )
          .run();
      } else {
        mockObservations.push(record);
      }

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/observations/:id", async (c) => {
    try {
      const id = c.req.param("id");

      if (isD1Enabled(c.env)) {
        const result = await c.env.DB!
          .prepare(
            `SELECT o.*, u."displayName" AS "authorName"
             FROM "observations" o
             LEFT JOIN "users" u ON u."id" = o."authorId"
             WHERE o."id" = ?`
          )
          .bind(id)
          .first();

        if (!result) {
          return c.json({ ok: false, error: "意见记录不存在" }, 404);
        }

        return c.json({ ok: true, data: result });
      }

      const record = mockObservations.find((item) => item.id === id);

      if (!record) {
        return c.json({ ok: false, error: "意见记录不存在" }, 404);
      }

      return c.json({
        ok: true,
        data: {
          ...record,
          authorName: await readAuthorName(record.authorId, c.env)
        }
      });
    } catch (e: any) {
      console.error("GET /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/observations/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        content?: string;
        type?: string;
        discipline?: string;
        date?: string;
      }>();
      const now = new Date().toISOString();

      if (isD1Enabled(c.env)) {
        const sets: string[] = ['"updatedAt" = ?'];
        const params: unknown[] = [now];

        if (body.content !== undefined) sets.push('"content" = ?'), params.push(body.content);
        if (body.type !== undefined) sets.push('"type" = ?'), params.push(body.type);
        if (body.discipline !== undefined) sets.push('"discipline" = ?'), params.push(body.discipline);
        if (body.date !== undefined) sets.push('"date" = ?'), params.push(body.date);

        params.push(id);

        await c.env.DB!
          .prepare(`UPDATE "observations" SET ${sets.join(", ")} WHERE "id" = ?`)
          .bind(...params)
          .run();
      } else {
        const record = mockObservations.find((item) => item.id === id);

        if (!record) {
          return c.json({ ok: false, error: "意见记录不存在" }, 404);
        }

        if (body.content !== undefined) record.content = body.content;
        if (body.type !== undefined) record.type = body.type;
        if (body.discipline !== undefined) {
          record.discipline = body.discipline as ObservationRecord["discipline"];
        }
        if (body.date !== undefined) record.date = body.date;
        record.updatedAt = now;
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/observations/:id/close", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{ closedBy?: string }>();
      const now = new Date().toISOString();
      const closedBy = body.closedBy || "sys-user";

      if (isD1Enabled(c.env)) {
        const info = await c.env.DB!
          .prepare(
            `UPDATE "observations"
             SET "status" = 'closed', "closedBy" = ?, "closedAt" = ?, "updatedAt" = ?
             WHERE "id" = ? AND "status" = 'open'`
          )
          .bind(closedBy, now, now, id)
          .run();

        if (info.meta?.changes === 0) {
          return c.json({ ok: false, error: "意见不存在或已关闭" }, 404);
        }
      } else {
        const record = mockObservations.find((item) => item.id === id && item.status === "open");

        if (!record) {
          return c.json({ ok: false, error: "意见不存在或已关闭" }, 404);
        }

        record.status = "closed";
        record.closedBy = closedBy;
        record.closedAt = now;
        record.updatedAt = now;
      }

      return c.json({ ok: true, data: { id, status: "closed", closedBy, closedAt: now } });
    } catch (e: any) {
      console.error("PUT /observations/:id/close error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

const observationRoutes = createObservationRoutes();

export { createObservationRoutes, observationRoutes };
