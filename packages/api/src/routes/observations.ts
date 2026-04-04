import { Hono } from "hono";
import type { Bindings } from "../env.ts";

// 生成简单 UUID
function generateId(): string {
  return crypto.randomUUID();
}

function createObservationRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  // 获取某船的意见列表（支持筛选）
  routes.get("/ships/:shipId/observations", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

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

      const stmt = db.prepare(sql);
      const result = await stmt.bind(...params).all();

      return c.json({
        ok: true,
        data: result.results ?? []
      });
    } catch (e: any) {
      console.error("GET /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增巡检/试航意见
  routes.post("/ships/:shipId/observations", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

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
      const id = generateId();
      // 默认使用 authorId，如果未传则用占位值
      const authorId = body.authorId || "sys-user";

      await db
        .prepare(
          `INSERT INTO "observations"
           ("id", "shipId", "type", "discipline", "authorId", "date", "content", "status", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
        )
        .bind(id, shipId, body.type, body.discipline, authorId, body.date, body.content, now, now)
        .run();

      return c.json({
        ok: true,
        data: {
          id, shipId, type: body.type, discipline: body.discipline,
          authorId, date: body.date, content: body.content,
          status: "open", closedBy: null, closedAt: null,
          createdAt: now, updatedAt: now
        }
      });
    } catch (e: any) {
      console.error("POST /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 获取意见详情
  routes.get("/observations/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const result = await db
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

  // 编辑意见
  routes.put("/observations/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{
        content?: string;
        type?: string;
        discipline?: string;
        date?: string;
      }>();

      const now = new Date().toISOString();
      const sets: string[] = [`"updatedAt" = ?`];
      const params: unknown[] = [now];

      if (body.content !== undefined) {
        sets.push(`"content" = ?`);
        params.push(body.content);
      }
      if (body.type !== undefined) {
        sets.push(`"type" = ?`);
        params.push(body.type);
      }
      if (body.discipline !== undefined) {
        sets.push(`"discipline" = ?`);
        params.push(body.discipline);
      }
      if (body.date !== undefined) {
        sets.push(`"date" = ?`);
        params.push(body.date);
      }

      params.push(id);

      await db
        .prepare(`UPDATE "observations" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 关闭意见
  routes.put("/observations/:id/close", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{ closedBy?: string }>();
      const now = new Date().toISOString();
      const closedBy = body.closedBy || "sys-user";

      const info = await db
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
