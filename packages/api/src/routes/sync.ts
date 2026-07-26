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
