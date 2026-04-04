import { Hono } from "hono";
import type { Bindings } from "../env.ts";

// 生成简单 UUID
function generateId(): string {
  return crypto.randomUUID();
}

function createProjectRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  // 查询项目列表（支持 status 筛选）
  routes.get("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const status = c.req.query("status");
      let sql = `SELECT * FROM "projects"`;
      const params: unknown[] = [];

      if (status) {
        sql += ` WHERE "status" = ?`;
        params.push(status);
      }

      sql += ` ORDER BY "createdAt" DESC`;

      const result = await db.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /projects error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 获取单个项目详情（含关联船舶列表）
  routes.get("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const project = await db
        .prepare(`SELECT * FROM "projects" WHERE "id" = ?`)
        .bind(id)
        .first();

      if (!project) {
        return c.json({ ok: false, error: "项目不存在" }, 404);
      }

      // 查询项目下的船舶列表
      const ships = await db
        .prepare(`SELECT * FROM "ships" WHERE "projectId" = ? ORDER BY "hullNumber" ASC`)
        .bind(id)
        .all();

      return c.json({
        ok: true,
        data: { ...project, ships: ships.results ?? [] }
      });
    } catch (e: any) {
      console.error("GET /projects/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增项目
  routes.post("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const body = await c.req.json<{
        name: string;
        code: string;
        owner?: string;
        shipyard?: string;
        class?: string;
        recipients?: string[];
      }>();

      if (!body.name || !body.code) {
        return c.json({ ok: false, error: "name 和 code 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const id = generateId();

      await db
        .prepare(
          `INSERT INTO "projects"
           ("id", "name", "code", "status", "owner", "shipyard", "class", "recipients", "createdAt", "updatedAt")
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          body.name,
          body.code,
          body.owner ?? null,
          body.shipyard ?? null,
          body.class ?? null,
          JSON.stringify(body.recipients ?? []),
          now,
          now
        )
        .run();

      return c.json({
        ok: true,
        data: {
          id,
          name: body.name,
          code: body.code,
          status: "active",
          owner: body.owner ?? null,
          shipyard: body.shipyard ?? null,
          class: body.class ?? null,
          recipients: body.recipients ?? [],
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (e: any) {
      console.error("POST /projects error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `项目编码 '${(await c.req.json()).code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 编辑项目
  routes.put("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{
        name?: string;
        code?: string;
        status?: string;
        owner?: string;
        shipyard?: string;
        class?: string;
        recipients?: string[];
      }>();

      const now = new Date().toISOString();
      const sets: string[] = [`"updatedAt" = ?`];
      const params: unknown[] = [now];

      if (body.name !== undefined) { sets.push(`"name" = ?`); params.push(body.name); }
      if (body.code !== undefined) { sets.push(`"code" = ?`); params.push(body.code); }
      if (body.status !== undefined) { sets.push(`"status" = ?`); params.push(body.status); }
      if (body.owner !== undefined) { sets.push(`"owner" = ?`); params.push(body.owner); }
      if (body.shipyard !== undefined) { sets.push(`"shipyard" = ?`); params.push(body.shipyard); }
      if (body.class !== undefined) { sets.push(`"class" = ?`); params.push(body.class); }
      if (body.recipients !== undefined) { sets.push(`"recipients" = ?`); params.push(JSON.stringify(body.recipients)); }

      params.push(id);

      const info = await db
        .prepare(`UPDATE "projects" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "项目不存在" }, 404);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /projects/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

export { createProjectRoutes };
