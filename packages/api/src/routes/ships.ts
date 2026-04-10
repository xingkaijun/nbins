import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { ShipRecord } from "../persistence/records.ts";
import { createRequireAuth, createRequireRole } from "../auth.ts";
import { resolveAllowedProjectIds } from "./route-helpers.ts";

import type { AuthContextVariables, AuthenticatedUser } from "../auth.ts";

function generateId(): string {
  return crypto.randomUUID();
}

type ShipRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

/**
 * 检查用户是否有项目访问权限
 * - admin 角色直接返回 true
 * - 其他角色需在 project_members 表中有记录
 */
async function checkProjectAccess(
  db: D1Database,
  user: AuthenticatedUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") {
    return true;
  }

  const allowedProjectIds = await resolveAllowedProjectIds(db, user.id);
  return allowedProjectIds.includes(projectId);
}


function createShipRoutes(): Hono<ShipRouteEnv> {
  const routes = new Hono<ShipRouteEnv>();
  
  routes.use("*", createRequireAuth());

  // 角色守卫
  const requireAdminOrManager = createRequireRole<ShipRouteEnv>(["admin", "manager"]);

  routes.get("/", async (c) => {
    try {
      const authUser = c.get("authUser");
      const projectId = c.req.query("projectId");
      const status = c.req.query("status");

      // 如果指定了 projectId，需要校验权限
      if (projectId) {
        const hasAccess = await checkProjectAccess(c.env.DB!, authUser, projectId);
        if (!hasAccess) {
          return c.json({ ok: false, error: "无权访问该项目" }, 403);
        }
      }

      const isAdmin = authUser.role === "admin";
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (!isAdmin) {
        const allowedProjectIds = await resolveAllowedProjectIds(c.env.DB!, authUser.id);
        if (allowedProjectIds.length === 0) {
          return c.json({ ok: true, data: [] });
        }

        conditions.push(`s."projectId" IN (${allowedProjectIds.map(() => "?").join(", ")})`);
        params.push(...allowedProjectIds);
      }

      if (projectId) {
        conditions.push(`s."projectId" = ?`);
        params.push(projectId);
      }
      if (status) {
        conditions.push(`s."status" = ?`);
        params.push(status);
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
      const sql = `SELECT s.* FROM "ships" s${where} ORDER BY s."hullNumber" ASC`;

      const result = await c.env.DB!.prepare(sql).bind(...params).all();


      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const id = c.req.param("id");

      const ship = await c.env.DB!
        .prepare('SELECT * FROM "ships" WHERE "id" = ?')
        .bind(id)
        .first<{ projectId: string } & Record<string, unknown>>();

      if (!ship) {
        return c.json({ ok: false, error: "船舶不存在" }, 404);
      }

      // 校验项目权限
      const hasAccess = await checkProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!hasAccess) {
        return c.json({ ok: false, error: "无权访问该船舶所在项目" }, 403);
      }

      return c.json({ ok: true, data: ship });
    } catch (e: any) {
      console.error("GET /ships/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", requireAdminOrManager, async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<{
        projectId: string;
        hullNumber: string;
        shipName: string;
        shipType?: string;
      }>();

      if (!body.projectId || !body.hullNumber || !body.shipName) {
        return c.json({ ok: false, error: "projectId, hullNumber, shipName 为必填项" }, 400);
      }

      // 校验项目权限（manager 角色需要在项目中有成员关系）
      const hasAccess = await checkProjectAccess(c.env.DB!, authUser, body.projectId);
      if (!hasAccess) {
        return c.json({ ok: false, error: "无权访问该项目" }, 403);
      }

      const now = new Date().toISOString();
      const record: ShipRecord = {
        id: generateId(),
        projectId: body.projectId,
        hullNumber: body.hullNumber,
        shipName: body.shipName,
        shipType: body.shipType ?? null,
        status: "building",
        createdAt: now,
        updatedAt: now
      };

      const project = await c.env.DB!
        .prepare('SELECT "id" FROM "projects" WHERE "id" = ?')
        .bind(body.projectId)
        .first();

      if (!project) {
        return c.json({ ok: false, error: `关联项目 '${body.projectId}' 不存在` }, 400);
      }

      await c.env.DB!
        .prepare(
          `INSERT INTO "ships"
           ("id", "projectId", "hullNumber", "shipName", "shipType", "status", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, 'building', ?, ?)`
        )
        .bind(
          record.id,
          record.projectId,
          record.hullNumber,
          record.shipName,
          record.shipType,
          record.createdAt,
          record.updatedAt
        )
        .run();

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /ships error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", requireAdminOrManager, async (c) => {
    try {
      const authUser = c.get("authUser");
      const id = c.req.param("id");
      const body = await c.req.json<{
        projectId?: string;
        hullNumber?: string;
        shipName?: string;
        shipType?: string;
        status?: string;
      }>();

      // 获取当前船只信息以校验权限
      const existingShip = await c.env.DB!
        .prepare('SELECT "projectId" FROM "ships" WHERE "id" = ?')
        .bind(id)
        .first<{ projectId: string }>();

      if (!existingShip) {
        return c.json({ ok: false, error: "船舶不存在" }, 404);
      }

      // 校验原项目权限
      const hasAccess = await checkProjectAccess(c.env.DB!, authUser, existingShip.projectId);
      if (!hasAccess) {
        return c.json({ ok: false, error: "无权访问该船舶所在项目" }, 403);
      }

      // 如果要修改项目，需要校验新项目权限
      if (body.projectId && body.projectId !== existingShip.projectId) {
        const hasNewAccess = await checkProjectAccess(c.env.DB!, authUser, body.projectId);
        if (!hasNewAccess) {
          return c.json({ ok: false, error: "无权访问目标项目" }, 403);
        }
      }

      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];

      if (body.projectId !== undefined) sets.push('"projectId" = ?'), params.push(body.projectId);
      if (body.hullNumber !== undefined) sets.push('"hullNumber" = ?'), params.push(body.hullNumber);
      if (body.shipName !== undefined) sets.push('"shipName" = ?'), params.push(body.shipName);
      if (body.shipType !== undefined) sets.push('"shipType" = ?'), params.push(body.shipType);
      if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);

      params.push(id);

      await c.env.DB!
        .prepare(`UPDATE "ships" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /ships/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

export { createShipRoutes };
