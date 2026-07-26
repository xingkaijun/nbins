import { Hono } from "hono";
import type { Bindings } from "../env.ts";

type SyncRouteEnv = { Bindings: Bindings };

// 服务间同步端点：供 ITP 等外部系统拉取主数据。
// 用独立的 SYNC_SERVICE_TOKEN（X-Sync-Token 头）鉴权，不走用户 JWT；
// 未配置该密钥时端点整体禁用。
function requireSyncToken() {
  return async (c: any, next: () => Promise<void>) => {
    const secret = c.env.SYNC_SERVICE_TOKEN;
    if (!secret) {
      return c.json(
        { ok: false, error: "Sync API is disabled (no SYNC_SERVICE_TOKEN configured)" },
        403
      );
    }
    const provided = c.req.header("X-Sync-Token");
    if (provided !== secret) {
      return c.json({ ok: false, error: "Unauthorized: invalid sync token" }, 401);
    }
    await next();
  };
}

function createSyncRoutes(): Hono<SyncRouteEnv> {
  const routes = new Hono<SyncRouteEnv>();

  routes.use("*", requireSyncToken());

  // 拉取检验状态事件流：?after=<游标>&limit=<条数>，按 id 升序返回
  routes.get("/events", async (c) => {
    try {
      const after = Number(c.req.query("after") ?? "0");
      const rawLimit = Number(c.req.query("limit") ?? "200");
      if (!Number.isFinite(after) || after < 0 || !Number.isFinite(rawLimit)) {
        return c.json({ ok: false, error: "after/limit must be non-negative numbers" }, 400);
      }
      const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 500);

      const result = await c.env.DB!
        .prepare('SELECT * FROM "sync_outbox" WHERE "id" > ? ORDER BY "id" ASC LIMIT ?')
        .bind(after, limit)
        .all<Record<string, unknown>>();

      const events = result.results ?? [];
      const cursor = events.length > 0 ? events[events.length - 1].id : after;

      return c.json({ ok: true, data: { events, cursor } });
    } catch (e: any) {
      console.error("GET /sync/events error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/master-data", async (c) => {
    try {
      const projects = await c.env.DB!
        .prepare(
          'SELECT "id", "name", "code", "status", "shipyard" FROM "projects" ORDER BY "createdAt" ASC'
        )
        .all<Record<string, unknown>>();

      const ships = await c.env.DB!
        .prepare(
          'SELECT "id", "projectId", "hullNumber", "shipName", "status" FROM "ships" ORDER BY "createdAt" ASC'
        )
        .all<Record<string, unknown>>();

      return c.json({
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          projects: projects.results ?? [],
          ships: ships.results ?? []
        }
      });
    } catch (e: any) {
      console.error("GET /sync/master-data error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

export { createSyncRoutes };
