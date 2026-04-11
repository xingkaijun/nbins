import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { ProjectRecord } from "../persistence/records.ts";
import { mapProjectRecord, resolveAllowedProjectIds } from "./route-helpers.ts";

import { createRequireAuth, createRequireRole } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";

function generateId(): string {
  return crypto.randomUUID();
}

type ProjectRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function createProjectRoutes(): Hono<ProjectRouteEnv> {
  const routes = new Hono<ProjectRouteEnv>();
  
  routes.use("*", createRequireAuth());

  // 角色守卫
  const requireAdminOrManager = createRequireRole<ProjectRouteEnv>(["admin", "manager"]);

  routes.get("/", async (c) => {
    try {
      const status = c.req.query("status");
      const authUser = c.get("authUser");

      const params: unknown[] = [];
      const conditions: string[] = [];

      if (authUser.role !== "admin") {
        const allowedProjectIds = await resolveAllowedProjectIds(c.env.DB!, authUser.id);
        if (allowedProjectIds.length === 0) {
          return c.json({ ok: true, data: [] });
        }

        conditions.push(`"id" IN (${allowedProjectIds.map(() => "?").join(", ")})`);
        params.push(...allowedProjectIds);
      }

      if (status) {
        conditions.push('"status" = ?');
        params.push(status);
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

      const result = await c.env.DB!
        .prepare(`SELECT * FROM "projects"${where} ORDER BY "createdAt" DESC`)
        .bind(...params)
        .all<Record<string, unknown>>();


      return c.json({
        ok: true,
        data: (result.results ?? []).map(mapProjectRecord)
      });
    } catch (e: any) {
      console.error("GET /projects error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const authUser = c.get("authUser");

      let projectRow;
      
      if (authUser.role === "admin") {
        projectRow = await c.env.DB!
          .prepare('SELECT * FROM "projects" WHERE "id" = ?')
          .bind(id)
          .first<Record<string, unknown>>();
      } else {
        const allowedProjectIds = await resolveAllowedProjectIds(c.env.DB!, authUser.id);
        if (!allowedProjectIds.includes(id)) {
          projectRow = null;
        } else {
          projectRow = await c.env.DB!
            .prepare('SELECT * FROM "projects" WHERE "id" = ?')
            .bind(id)
            .first<Record<string, unknown>>();
        }
      }


      if (!projectRow) {
        return c.json({ ok: false, error: "项目不存在或无权访问" }, 404);
      }

      const ships = await c.env.DB!
        .prepare('SELECT * FROM "ships" WHERE "projectId" = ? ORDER BY "hullNumber" ASC')
        .bind(id)
        .all();

      return c.json({
        ok: true,
        data: { ...mapProjectRecord(projectRow), ships: ships.results ?? [] }
      });
    } catch (e: any) {
      console.error("GET /projects/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", requireAdminOrManager, async (c) => {
    const body = await c.req.json<{
      name: string;
      code: string;
      owner?: string;
      shipyard?: string;
      class?: string;
      disciplines?: string[];
      reportRecipients?: string[];
      ncrRecipients?: string[];
    }>();

    if (!body.name || !body.code) {
      return c.json({ ok: false, error: "name 和 code 为必填项" }, 400);
    }

    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id: generateId(),
      name: body.name,
      code: body.code,
      status: "active",
      owner: body.owner ?? null,
      shipyard: body.shipyard ?? null,
      class: body.class ?? null,
      disciplines: body.disciplines ?? [],
      reportRecipients: body.reportRecipients ?? [],
      ncrRecipients: body.ncrRecipients ?? [],
      createdAt: now,
      updatedAt: now
    };

    try {
      await c.env.DB!
        .prepare(
          `INSERT INTO "projects"
           ("id", "name", "code", "status", "owner", "shipyard", "class", "disciplines", "reportRecipients", "ncrRecipients", "createdAt", "updatedAt")
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          record.id,
          record.name,
          record.code,
          record.owner,
          record.shipyard,
          record.class,
          JSON.stringify(record.disciplines),
          JSON.stringify(record.reportRecipients),
          JSON.stringify(record.ncrRecipients),
          record.createdAt,
          record.updatedAt
        )
        .run();

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /projects error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `项目编码 '${record.code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", requireAdminOrManager, async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        name?: string;
        code?: string;
        status?: string;
        owner?: string;
        shipyard?: string;
        class?: string;
        disciplines?: string[];
        reportRecipients?: string[];
        ncrRecipients?: string[];
      }>();
      const now = new Date().toISOString();

      const sets: string[] = ['"updatedAt" = ?'];
      const params: unknown[] = [now];

      if (body.name !== undefined) sets.push('"name" = ?'), params.push(body.name);
      if (body.code !== undefined) sets.push('"code" = ?'), params.push(body.code);
      if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);
      if (body.owner !== undefined) sets.push('"owner" = ?'), params.push(body.owner);
      if (body.shipyard !== undefined) sets.push('"shipyard" = ?'), params.push(body.shipyard);
      if (body.class !== undefined) sets.push('"class" = ?'), params.push(body.class);
      if (body.disciplines !== undefined) {
        sets.push('"disciplines" = ?');
        params.push(JSON.stringify(body.disciplines));
      }
      if (body.reportRecipients !== undefined) {
        sets.push('"reportRecipients" = ?');
        params.push(JSON.stringify(body.reportRecipients));
      }
      if (body.ncrRecipients !== undefined) {
        sets.push('"ncrRecipients" = ?');
        params.push(JSON.stringify(body.ncrRecipients));
      }

      params.push(id);

      const info = await c.env.DB!
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
