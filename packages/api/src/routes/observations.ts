import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { ObservationRecord } from "../persistence/records.ts";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";

function generateId(): string {
  return crypto.randomUUID();
}

type ObsRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function createObservationRoutes(): Hono<ObsRouteEnv> {
  const routes = new Hono<ObsRouteEnv>();
  
  routes.use("*", createRequireAuth());

  routes.get("/ships/:shipId/observations", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const type = c.req.query("type");
      const discipline = c.req.query("discipline");
      const status = c.req.query("status");
      const dateFrom = c.req.query("date_from");
      const dateTo = c.req.query("date_to");

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
        authorId: c.get("authUser").id,
        date: body.date,
        content: body.content,
        status: "open",
        closedBy: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now
      };

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

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/observations/:id", async (c) => {
    try {
      const id = c.req.param("id");

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
    } catch (e: any) {
      console.error("GET /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/observations/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        shipId?: string;
        content?: string;
        type?: string;
        discipline?: string;
        authorId?: string;
        date?: string;
        status?: "open" | "closed";
        closedBy?: string | null;
        closedAt?: string | null;
      }>();
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];

      if (body.content !== undefined) sets.push('"content" = ?'), params.push(body.content);
      if (body.shipId !== undefined) sets.push('"shipId" = ?'), params.push(body.shipId);
      if (body.type !== undefined) sets.push('"type" = ?'), params.push(body.type);
      if (body.discipline !== undefined) sets.push('"discipline" = ?'), params.push(body.discipline);
      if (body.authorId !== undefined) sets.push('"authorId" = ?'), params.push(body.authorId);
      if (body.date !== undefined) sets.push('"date" = ?'), params.push(body.date);
      if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);
      if (body.closedBy !== undefined) sets.push('"closedBy" = ?'), params.push(body.closedBy);
      if (body.closedAt !== undefined) sets.push('"closedAt" = ?'), params.push(body.closedAt);

      params.push(id);

      await c.env.DB!
        .prepare(`UPDATE "observations" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/observations/:id/close", async (c) => {
    try {
      const id = c.req.param("id");
      const now = new Date().toISOString();
      const closedBy = c.get("authUser").id;

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
