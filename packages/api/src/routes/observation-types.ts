import { Hono } from "hono";
import type { Bindings } from "../env.ts";

// 生成简单 UUID
function generateId(): string {
  return crypto.randomUUID();
}

function createObservationTypeRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  // 获取所有意见类型
  routes.get("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const result = await db
        .prepare('SELECT * FROM "observation_types" ORDER BY "sortOrder" ASC, "code" ASC')
        .all();

      return c.json({
        ok: true,
        data: result.results ?? []
      });
    } catch (e: any) {
      console.error("GET /observation-types error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增自定义意见类型
  routes.post("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const body = await c.req.json<{ code: string; label: string; sortOrder?: number }>();

      if (!body.code || !body.label) {
        return c.json({ ok: false, error: "code 和 label 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const id = generateId();

      await db
        .prepare(
          `INSERT INTO "observation_types" ("id", "code", "label", "sortOrder", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, body.code, body.label, body.sortOrder ?? 0, now, now)
        .run();

      return c.json({
        ok: true,
        data: { id, code: body.code, label: body.label, sortOrder: body.sortOrder ?? 0, createdAt: now, updatedAt: now }
      });
    } catch (e: any) {
      console.error("POST /observation-types error:", e);
      // 处理 UNIQUE 约束冲突
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `类型编码 '${(await c.req.json()).code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

const observationTypeRoutes = createObservationTypeRoutes();

export { createObservationTypeRoutes, observationTypeRoutes };
