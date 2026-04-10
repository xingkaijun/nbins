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

  // 项目级查询（跨船号）
  routes.get("/observations", async (c) => {
    try {
      const projectId = c.req.query("projectId");
      const shipId = c.req.query("shipId");
      const type = c.req.query("type");
      const discipline = c.req.query("discipline");
      const status = c.req.query("status");

      let sql = `
        SELECT o.*, u."displayName" AS "authorName"
        FROM "observations" o
        LEFT JOIN "users" u ON u."id" = o."authorId"
        INNER JOIN "ships" s ON s."id" = o."shipId"
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (projectId) {
        sql += ` AND s."projectId" = ?`;
        params.push(projectId);
      }
      if (shipId) {
        sql += ` AND o."shipId" = ?`;
        params.push(shipId);
      }
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

      sql += ` ORDER BY o."serialNo" ASC, o."date" DESC, o."createdAt" DESC`;

      const result = await c.env.DB!.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // Inspection Comments 聚合（只读）
  routes.get("/observations/inspection-comments", async (c) => {
    try {
      const projectId = c.req.query("projectId");
      const shipId = c.req.query("shipId");
      const discipline = c.req.query("discipline");
      const status = c.req.query("status");

      let sql = `
        SELECT
          cm."id",
          ii."shipId",
          sh."hullNumber",
          ii."discipline",
          ii."itemName" AS "inspectionItemName",
          ir."roundNumber",
          cm."localId",
          cm."content",
          cm."status",
          cm."authorId",
          u."displayName" AS "authorName",
          cm."createdAt",
          cm."closedAt",
          cm."closedBy",
          cm."resolveRemark"
        FROM "comments" cm
        INNER JOIN "inspection_items" ii ON ii."id" = cm."inspectionItemId"
        INNER JOIN "inspection_rounds" ir ON ir."id" = cm."createdInRoundId"
        INNER JOIN "ships" sh ON sh."id" = ii."shipId"
        LEFT JOIN "users" u ON u."id" = cm."authorId"
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (projectId) {
        sql += ` AND sh."projectId" = ?`;
        params.push(projectId);
      }
      if (shipId) {
        sql += ` AND ii."shipId" = ?`;
        params.push(shipId);
      }
      if (discipline) {
        sql += ` AND ii."discipline" = ?`;
        params.push(discipline);
      }
      if (status) {
        sql += ` AND cm."status" = ?`;
        params.push(status);
      }

      sql += ` ORDER BY cm."createdAt" DESC`;

      const result = await c.env.DB!.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /observations/inspection-comments error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 按船号查询
  routes.get("/ships/:shipId/observations", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const type = c.req.query("type");
      const discipline = c.req.query("discipline");
      const status = c.req.query("status");

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

      sql += ` ORDER BY o."serialNo" ASC, o."date" DESC, o."createdAt" DESC`;

      const result = await c.env.DB!.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增单条
  routes.post("/ships/:shipId/observations", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const body = await c.req.json<{
        type: string;
        discipline: string;
        location?: string;
        date: string;
        content: string;
        remark?: string;
      }>();

      if (!body.type || !body.discipline || !body.content || !body.date) {
        return c.json({ ok: false, error: "type, discipline, date, content are required" }, 400);
      }

      // 计算序号：同船+同类型下的最大序号+1
      const maxRow = await c.env.DB!
        .prepare(`SELECT MAX("serialNo") as "maxNo" FROM "observations" WHERE "shipId" = ? AND "type" = ?`)
        .bind(shipId, body.type)
        .first<{ maxNo: number | null }>();
      const serialNo = (maxRow?.maxNo ?? 0) + 1;

      const now = new Date().toISOString();
      const id = generateId();

      await c.env.DB!
        .prepare(
          `INSERT INTO "observations"
           ("id", "shipId", "type", "discipline", "authorId", "serialNo", "location", "date", "content", "remark", "status", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
        )
        .bind(
          id, shipId, body.type, body.discipline,
          c.get("authUser").id,
          serialNo,
          body.location ?? null,
          body.date, body.content,
          body.remark ?? null,
          now, now
        )
        .run();

      return c.json({ ok: true, data: { id, serialNo, shipId, type: body.type, createdAt: now } });
    } catch (e: any) {
      console.error("POST /ships/:shipId/observations error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 粘贴批量导入
  routes.post("/ships/:shipId/observations/batch", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const body = await c.req.json<{
        type: string;
        items: Array<{
          discipline: string;
          location?: string;
          date: string;
          content: string;
          remark?: string;
        }>;
      }>();

      if (!body.type || !Array.isArray(body.items) || body.items.length === 0) {
        return c.json({ ok: false, error: "type and items[] are required" }, 400);
      }

      // 获取当前最大序号
      const maxRow = await c.env.DB!
        .prepare(`SELECT MAX("serialNo") as "maxNo" FROM "observations" WHERE "shipId" = ? AND "type" = ?`)
        .bind(shipId, body.type)
        .first<{ maxNo: number | null }>();
      let nextSerial = (maxRow?.maxNo ?? 0) + 1;

      const now = new Date().toISOString();
      const authorId = c.get("authUser").id;

      const stmts = body.items.map((item) => {
        const id = generateId();
        const serial = nextSerial++;
        return c.env.DB!
          .prepare(
            `INSERT INTO "observations"
             ("id", "shipId", "type", "discipline", "authorId", "serialNo", "location", "date", "content", "remark", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
          )
          .bind(
            id, shipId, body.type, item.discipline,
            authorId, serial,
            item.location ?? null,
            item.date, item.content,
            item.remark ?? null,
            now, now
          );
      });

      // D1 batch 执行
      await c.env.DB!.batch(stmts);

      return c.json({ ok: true, data: { imported: body.items.length } });
    } catch (e: any) {
      console.error("POST /ships/:shipId/observations/batch error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 获取单条
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
        return c.json({ ok: false, error: "Observation not found" }, 404);
      }

      return c.json({ ok: true, data: result });
    } catch (e: any) {
      console.error("GET /observations/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 更新单条
  routes.put("/observations/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        content?: string;
        type?: string;
        discipline?: string;
        location?: string | null;
        date?: string;
        remark?: string | null;
        status?: "open" | "closed";
        closedBy?: string | null;
        closedAt?: string | null;
      }>();
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];

      if (body.content !== undefined) sets.push('"content" = ?'), params.push(body.content);
      if (body.type !== undefined) sets.push('"type" = ?'), params.push(body.type);
      if (body.discipline !== undefined) sets.push('"discipline" = ?'), params.push(body.discipline);
      if (body.location !== undefined) sets.push('"location" = ?'), params.push(body.location);
      if (body.date !== undefined) sets.push('"date" = ?'), params.push(body.date);
      if (body.remark !== undefined) sets.push('"remark" = ?'), params.push(body.remark);
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

  // 关闭
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
        return c.json({ ok: false, error: "Observation not found or already closed" }, 404);
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
