import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { ProjectRecord } from "../persistence/records.ts";
import { isD1Enabled, mapProjectRecord } from "./route-helpers.ts";

function generateId(): string {
  return crypto.randomUUID();
}

function createProjectRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (c) => {
    try {
      const status = c.req.query("status");

      if (isD1Enabled(c.env)) {
        const sqlParts = ['SELECT * FROM "projects"'];
        const params: unknown[] = [];

        if (status) {
          sqlParts.push('WHERE "status" = ?');
          params.push(status);
        }

        sqlParts.push('ORDER BY "createdAt" DESC');

        const result = await c.env.DB!
          .prepare(sqlParts.join(" "))
          .bind(...params)
          .all<Record<string, unknown>>();

        return c.json({
          ok: true,
          data: (result.results ?? []).map(mapProjectRecord)
        });
      }

      const snapshot = await resolveStorage(c.env).read();
      const projects = snapshot.projects
        .filter((project) => !status || project.status === status)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return c.json({ ok: true, data: projects });
    } catch (e: any) {
      console.error("GET /projects error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");

      if (isD1Enabled(c.env)) {
        const projectRow = await c.env.DB!
          .prepare('SELECT * FROM "projects" WHERE "id" = ?')
          .bind(id)
          .first<Record<string, unknown>>();

        if (!projectRow) {
          return c.json({ ok: false, error: "项目不存在" }, 404);
        }

        const ships = await c.env.DB!
          .prepare('SELECT * FROM "ships" WHERE "projectId" = ? ORDER BY "hullNumber" ASC')
          .bind(id)
          .all();

        return c.json({
          ok: true,
          data: { ...mapProjectRecord(projectRow), ships: ships.results ?? [] }
        });
      }

      const snapshot = await resolveStorage(c.env).read();
      const project = snapshot.projects.find((record) => record.id === id);

      if (!project) {
        return c.json({ ok: false, error: "项目不存在" }, 404);
      }

      const ships = snapshot.ships
        .filter((ship) => ship.projectId === id)
        .sort((left, right) => left.hullNumber.localeCompare(right.hullNumber));

      return c.json({
        ok: true,
        data: { ...project, ships }
      });
    } catch (e: any) {
      console.error("GET /projects/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{
      name: string;
      code: string;
      owner?: string;
      shipyard?: string;
      class?: string;
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
      reportRecipients: body.reportRecipients ?? [],
      ncrRecipients: body.ncrRecipients ?? [],
      createdAt: now,
      updatedAt: now
    };

    try {
      if (isD1Enabled(c.env)) {
        await c.env.DB!
          .prepare(
            `INSERT INTO "projects"
             ("id", "name", "code", "status", "owner", "shipyard", "class", "reportRecipients", "ncrRecipients", "createdAt", "updatedAt")
             VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.name,
            record.code,
            record.owner,
            record.shipyard,
            record.class,
            JSON.stringify(record.reportRecipients),
            JSON.stringify(record.ncrRecipients),
            record.createdAt,
            record.updatedAt
          )
          .run();
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();

        if (snapshot.projects.some((project) => project.code === record.code)) {
          return c.json({ ok: false, error: `项目编码 '${record.code}' 已存在` }, 409);
        }

        snapshot.projects.push(record);
        await storage.write(snapshot);
      }

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /projects error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `项目编码 '${record.code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        name?: string;
        code?: string;
        status?: string;
        owner?: string;
        shipyard?: string;
        class?: string;
        reportRecipients?: string[];
        ncrRecipients?: string[];
      }>();
      const now = new Date().toISOString();

      if (isD1Enabled(c.env)) {
        const sets: string[] = ['"updatedAt" = ?'];
        const params: unknown[] = [now];

        if (body.name !== undefined) sets.push('"name" = ?'), params.push(body.name);
        if (body.code !== undefined) sets.push('"code" = ?'), params.push(body.code);
        if (body.status !== undefined) sets.push('"status" = ?'), params.push(body.status);
        if (body.owner !== undefined) sets.push('"owner" = ?'), params.push(body.owner);
        if (body.shipyard !== undefined) sets.push('"shipyard" = ?'), params.push(body.shipyard);
        if (body.class !== undefined) sets.push('"class" = ?'), params.push(body.class);
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
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();
        const project = snapshot.projects.find((record) => record.id === id);

        if (!project) {
          return c.json({ ok: false, error: "项目不存在" }, 404);
        }

        if (
          body.code !== undefined &&
          snapshot.projects.some((record) => record.id !== id && record.code === body.code)
        ) {
          return c.json({ ok: false, error: `项目编码 '${body.code}' 已存在` }, 409);
        }

        if (body.name !== undefined) project.name = body.name;
        if (body.code !== undefined) project.code = body.code;
        if (body.status === "active" || body.status === "archived") project.status = body.status;
        if (body.owner !== undefined) project.owner = body.owner;
        if (body.shipyard !== undefined) project.shipyard = body.shipyard;
        if (body.class !== undefined) project.class = body.class;
        if (body.reportRecipients !== undefined) project.reportRecipients = body.reportRecipients;
        if (body.ncrRecipients !== undefined) project.ncrRecipients = body.ncrRecipients;
        project.updatedAt = now;

        await storage.write(snapshot);
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
