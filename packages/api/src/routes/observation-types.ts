import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { ObservationTypeRecord } from "../persistence/records.ts";
import { createRequireAuth, createRequireRole } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";

function generateId(): string {
  return crypto.randomUUID();
}

type ObsTypeRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function createObservationTypeRoutes(): Hono<ObsTypeRouteEnv> {
  const routes = new Hono<ObsTypeRouteEnv>();
  
  routes.use("*", createRequireAuth());

  // 角色守卫
  const requireAdmin = createRequireRole<ObsTypeRouteEnv>(["admin"]);

  routes.get("/", async (c) => {
    try {
      const result = await c.env.DB!
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

  routes.post("/", requireAdmin, async (c) => {
    const body = await c.req.json<{ code: string; label: string; sortOrder?: number }>();

    if (!body.code || !body.label) {
      return c.json({ ok: false, error: "code 和 label 为必填项" }, 400);
    }

    const now = new Date().toISOString();
    const record: ObservationTypeRecord = {
      id: generateId(),
      code: body.code,
      label: body.label,
      sortOrder: body.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now
    };

    try {
      await c.env.DB!
        .prepare(
          `INSERT INTO "observation_types" ("id", "code", "label", "sortOrder", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(record.id, record.code, record.label, record.sortOrder, record.createdAt, record.updatedAt)
        .run();

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /observation-types error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `类型编码 '${record.code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", requireAdmin, async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{ label?: string; sortOrder?: number }>();
      const now = new Date().toISOString();

      if (body.label === undefined && body.sortOrder === undefined) {
        return c.json({ ok: false, error: "label 或 sortOrder 至少提供一个" }, 400);
      }

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];

      if (body.label !== undefined) {
        sets.push('"label" = ?');
        params.push(body.label);
      }
      if (body.sortOrder !== undefined) {
        sets.push('"sortOrder" = ?');
        params.push(body.sortOrder);
      }

      params.push(id);

      const info = await c.env.DB!
        .prepare(`UPDATE "observation_types" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "意见类型不存在" }, 404);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /observation-types/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

const observationTypeRoutes = createObservationTypeRoutes();

export { createObservationTypeRoutes, observationTypeRoutes };
