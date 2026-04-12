import { Hono } from "hono";
import type { Bindings } from "../env.ts";

function requireSecret() {
  return async (c: any, next: () => Promise<void>) => {
    const secret = c.env.SQL_CONSOLE_SECRET;
    if (!secret) {
      return c.json({ ok: false, error: "SQL console is disabled (no secret configured)" }, 403);
    }
    const reqSecret = c.req.header("X-SQL-Secret");
    if (reqSecret !== secret) {
      return c.json({ ok: false, error: "Unauthorized: Invalid SQL console secret" }, 401);
    }
    await next();
  };
}

export function createSqlConsoleRoutes(): Hono<{ Bindings: Bindings }> {
  const sqlRoutes = new Hono<{ Bindings: Bindings }>();

  sqlRoutes.use("*", requireSecret());

  sqlRoutes.post("/execute", async (c) => {
    try {
      const { sql } = await c.req.json<{ sql: string }>();
      if (!sql || typeof sql !== "string") {
        return c.json({ ok: false, error: "Missing or invalid SQL string" }, 400);
      }

      const isSelect = sql.trim().toLowerCase().startsWith("select");
      
      if (isSelect) {
        const { results } = await c.env.DB!.prepare(sql).all();
        return c.json({ ok: true, data: { type: "select", results } });
      } else {
        const result = await c.env.DB!.prepare(sql).run();
        return c.json({ 
          ok: true, 
          data: { 
            type: "mutation", 
            changes: result.meta?.changes ?? 0, 
            duration: result.meta?.duration ?? 0,
            last_row_id: result.meta?.last_row_id 
          } 
        });
      }
    } catch (e: any) {
      console.error("SQL execute error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  sqlRoutes.get("/export-db", async (c) => {
    try {
      const tables = [
        "users", "projects", "project_members", "ships", "inspection_items", 
        "inspection_rounds", "comments", "ncrs", "observation_types", "observations"
      ];
      
      const data: Record<string, any[]> = {};
      for (const table of tables) {
        const { results } = await c.env.DB!.prepare(`SELECT * FROM "${table}"`).all();
        data[table] = results;
      }
      return c.json({ ok: true, data });
    } catch (e: any) {
      console.error("DB export error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  sqlRoutes.post("/import-db", async (c) => {
    try {
      const { data } = await c.req.json<{ data: Record<string, any[]> }>();
      if (!data || typeof data !== "object") {
        return c.json({ ok: false, error: "Invalid data format" }, 400);
      }

      const tables = [
        "observations", "observation_types", "ncrs", "comments", "inspection_rounds", 
        "inspection_items", "ships", "project_members", "projects", "users"
      ];

      const statements: any[] = [];
      
      // Clear existing records
      for (const table of tables) {
        statements.push(c.env.DB!.prepare(`DELETE FROM "${table}"`));
      }

      // Reverse order for insertions
      const insertTables = [...tables].reverse();
      
      for (const table of insertTables) {
        const rows = data[table] || [];
        for (const row of rows) {
          const keys = Object.keys(row).map(k => `"${k}"`).join(", ");
          const placeholders = Object.keys(row).map(() => "?").join(", ");
          const values = Object.values(row);
          statements.push(c.env.DB!.prepare(`INSERT INTO "${table}" (${keys}) VALUES (${placeholders})`).bind(...values));
        }
      }

      await c.env.DB!.batch(statements);
      return c.json({ ok: true, data: { success: true } });
    } catch (e: any) {
      console.error("DB import error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  sqlRoutes.get("/export-project/:projectId", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      
      const project = await c.env.DB!.prepare(`SELECT * FROM "projects" WHERE "id" = ?`).bind(projectId).first();
      if (!project) return c.json({ ok: false, error: "Project not found" }, 404);

      const memRes = await c.env.DB!.prepare(`SELECT * FROM "project_members" WHERE "projectId" = ?`).bind(projectId).all();
      const shipsRes = await c.env.DB!.prepare(`SELECT * FROM "ships" WHERE "projectId" = ?`).bind(projectId).all();
      const shipIds = shipsRes.results.map(s => s.id);
      
      const pData: Record<string, any[]> = {
        projects: [project],
        project_members: memRes.results,
        ships: shipsRes.results,
        inspection_items: [],
        inspection_rounds: [],
        comments: [],
        ncrs: [],
        observations: []
      };

      if (shipIds.length > 0) {
        const placeholders = shipIds.map(() => "?").join(", ");
        
        const itemsRes = await c.env.DB!.prepare(`SELECT * FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds).all();
        pData.inspection_items = itemsRes.results;
        
        const itemIds = itemsRes.results.map(i => i.id);
        if (itemIds.length > 0) {
          const iPlaceholders = itemIds.map(() => "?").join(", ");
          const roundsRes = await c.env.DB!.prepare(`SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds).all();
          pData.inspection_rounds = roundsRes.results;
          
          const commentsRes = await c.env.DB!.prepare(`SELECT * FROM "comments" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds).all();
          pData.comments = commentsRes.results;
        }

        const ncrsRes = await c.env.DB!.prepare(`SELECT * FROM "ncrs" WHERE "shipId" IN (${placeholders})`).bind(...shipIds).all();
        pData.ncrs = ncrsRes.results;
        
        const obsRes = await c.env.DB!.prepare(`SELECT * FROM "observations" WHERE "shipId" IN (${placeholders})`).bind(...shipIds).all();
        pData.observations = obsRes.results;
      }
      
      // We don't export users or observation_types as they are global/shared
      return c.json({ ok: true, data: pData });
    } catch (e: any) {
      console.error("Project export error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  sqlRoutes.post("/import-project", async (c) => {
    try {
      const { data } = await c.req.json<{ data: Record<string, any[]> }>();
      if (!data || !data.projects || data.projects.length !== 1) {
        return c.json({ ok: false, error: "Invalid project export data format" }, 400);
      }

      const tables = [
        "projects", "project_members", "ships", "inspection_items", 
        "inspection_rounds", "comments", "ncrs", "observations"
      ];

      const statements: any[] = [];
      const projectId = data.projects[0].id;

      // Delete existing project data
      const shipIds = (await c.env.DB!.prepare(`SELECT id FROM "ships" WHERE "projectId" = ?`).bind(projectId).all()).results.map(s => s.id);
      
      if (shipIds.length > 0) {
        const placeholders = shipIds.map(() => "?").join(", ");
        const itemIds = (await c.env.DB!.prepare(`SELECT id FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds).all()).results.map(i => i.id);
        
        if (itemIds.length > 0) {
          const iPlaceholders = itemIds.map(() => "?").join(", ");
          statements.push(c.env.DB!.prepare(`DELETE FROM "comments" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds));
          statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_rounds" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds));
        }
        statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncrs" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "observations" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
      }
      statements.push(c.env.DB!.prepare(`DELETE FROM "ships" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "project_members" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "projects" WHERE "id" = ?`).bind(projectId));

      // Insert new data
      for (const table of tables) {
        const rows = data[table] || [];
        for (const row of rows) {
          const keys = Object.keys(row).map(k => `"${k}"`).join(", ");
          const placeholders = Object.keys(row).map(() => "?").join(", ");
          const values = Object.values(row);
          statements.push(c.env.DB!.prepare(`INSERT INTO "${table}" (${keys}) VALUES (${placeholders})`).bind(...values));
        }
      }

      await c.env.DB!.batch(statements);
      return c.json({ ok: true, data: { success: true } });
    } catch (e: any) {
      console.error("Project import error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  sqlRoutes.delete("/delete-project/:projectId", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      const statements: any[] = [];
      
      const shipIds = (await c.env.DB!.prepare(`SELECT id FROM "ships" WHERE "projectId" = ?`).bind(projectId).all()).results.map(s => s.id);
      
      if (shipIds.length > 0) {
        const placeholders = shipIds.map(() => "?").join(", ");
        const itemIds = (await c.env.DB!.prepare(`SELECT id FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds).all()).results.map(i => i.id);
        
        if (itemIds.length > 0) {
          const iPlaceholders = itemIds.map(() => "?").join(", ");
          statements.push(c.env.DB!.prepare(`DELETE FROM "comments" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds));
          statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_rounds" WHERE "inspectionItemId" IN (${iPlaceholders})`).bind(...itemIds));
        }
        statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncrs" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "observations" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
      }
      statements.push(c.env.DB!.prepare(`DELETE FROM "ships" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "project_members" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "projects" WHERE "id" = ?`).bind(projectId));

      await c.env.DB!.batch(statements);
      return c.json({ ok: true, data: { success: true } });
    } catch (e: any) {
      console.error("Project delete error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return sqlRoutes;
}
