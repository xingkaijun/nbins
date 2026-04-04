import { Hono } from "hono";
import type { Bindings } from "../env.ts";

// 生成简单 UUID
function generateId(): string {
  return crypto.randomUUID();
}

function createShipRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  // 查询某项目下的所有船舶
  routes.get("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const projectId = c.req.query("projectId");
      const status = c.req.query("status");

      let sql = `SELECT * FROM "ships"`;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (projectId) {
        conditions.push(`"projectId" = ?`);
        params.push(projectId);
      }
      if (status) {
        conditions.push(`"status" = ?`);
        params.push(status);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }

      sql += ` ORDER BY "hullNumber" ASC`;

      const result = await db.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 获取单条船舶详情
  routes.get("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const ship = await db
        .prepare(`SELECT * FROM "ships" WHERE "id" = ?`)
        .bind(id)
        .first();

      if (!ship) {
        return c.json({ ok: false, error: "船舶不存在" }, 404);
      }

      return c.json({ ok: true, data: ship });
    } catch (e: any) {
      console.error("GET /ships/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增船舶
  routes.post("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const body = await c.req.json<{
        projectId: string;
        hullNumber: string;
        shipName: string;
        shipType?: string;
      }>();

      if (!body.projectId || !body.hullNumber || !body.shipName) {
        return c.json({ ok: false, error: "projectId, hullNumber, shipName 为必填项" }, 400);
      }

      // 校验 projectId 是否存在
      const project = await db
        .prepare(`SELECT "id" FROM "projects" WHERE "id" = ?`)
        .bind(body.projectId)
        .first();

      if (!project) {
        return c.json({ ok: false, error: `关联项目 '${body.projectId}' 不存在` }, 400);
      }

      const now = new Date().toISOString();
      const id = generateId();

      await db
        .prepare(
          `INSERT INTO "ships"
           ("id", "projectId", "hullNumber", "shipName", "shipType", "status", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, 'building', ?, ?)`
        )
        .bind(id, body.projectId, body.hullNumber, body.shipName, body.shipType ?? null, now, now)
        .run();

      return c.json({
        ok: true,
        data: {
          id,
          projectId: body.projectId,
          hullNumber: body.hullNumber,
          shipName: body.shipName,
          shipType: body.shipType ?? null,
          status: "building",
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (e: any) {
      console.error("POST /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 编辑船舶
  routes.put("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{
        hullNumber?: string;
        shipName?: string;
        shipType?: string;
        status?: string;
      }>();

      const now = new Date().toISOString();
      const sets: string[] = [`"updatedAt" = ?`];
      const params: unknown[] = [now];

      if (body.hullNumber !== undefined) { sets.push(`"hullNumber" = ?`); params.push(body.hullNumber); }
      if (body.shipName !== undefined) { sets.push(`"shipName" = ?`); params.push(body.shipName); }
      if (body.shipType !== undefined) { sets.push(`"shipType" = ?`); params.push(body.shipType); }
      if (body.status !== undefined) { sets.push(`"status" = ?`); params.push(body.status); }

      params.push(id);

      const info = await db
        .prepare(`UPDATE "ships" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "船舶不存在" }, 404);
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
