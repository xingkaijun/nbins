import { Hono } from "hono";
import type { Bindings } from "../env.ts";

type SqlConsoleEnv = { Bindings: Bindings };
type SqlExportData = Record<string, Array<Record<string, unknown>>> & { __r2?: R2BackupPayload };

type R2BackupObject = {
  key: string;
  bodyBase64: string;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheExpiry?: string;
};

type R2BackupPayload = {
  version: 1;
  exportedAt: string;
  objects: R2BackupObject[];
};

const FULL_DB_TABLES = [
  "users",
  "projects",
  "project_members",
  "ships",
  "inspection_items",
  "inspection_rounds",
  "comments",
  "ncrs",
  "ncr_index",
  "observation_types",
  "observations"
] as const;

const PROJECT_EXPORT_TABLES = [
  "projects",
  "project_members",
  "ships",
  "inspection_items",
  "inspection_rounds",
  "comments",
  "ncrs",
  "ncr_index",
  "observations"
] as const;

const FULL_R2_PREFIXES = ["ncrs/", "media/", "ncr-files/", "ncr-pdf/"] as const;

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function stripReservedFields(data: Record<string, unknown>): Record<string, Array<Record<string, unknown>>> {
  const cleaned: Record<string, Array<Record<string, unknown>>> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("__")) {
      continue;
    }
    cleaned[key] = Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      : [];
  }

  return cleaned;
}

function getProjectR2Prefixes(shipIds: string[]): string[] {
  return shipIds.flatMap((shipId) => [
    `ncrs/${shipId}/`,
    `media/${shipId}/`,
    `ncr-files/${shipId}/`,
    `ncr-pdf/${shipId}/`
  ]);
}

async function listBucketKeys(bucket: NonNullable<Bindings["BUCKET"]>, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix, cursor });
    keys.push(...listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return keys;
}

async function deleteBucketPrefixes(bucket: Bindings["BUCKET"], prefixes: string[]): Promise<void> {
  if (!bucket || prefixes.length === 0) {
    return;
  }

  const keys = Array.from(new Set((await Promise.all(prefixes.map((prefix) => listBucketKeys(bucket, prefix)))).flat()));
  for (const key of keys) {
    await bucket.delete(key);
  }
}

async function exportBucketPrefixes(bucket: Bindings["BUCKET"], prefixes: string[]): Promise<R2BackupPayload | undefined> {
  if (!bucket || prefixes.length === 0) {
    return undefined;
  }

  const keys = Array.from(new Set((await Promise.all(prefixes.map((prefix) => listBucketKeys(bucket, prefix)))).flat())).sort();
  if (keys.length === 0) {
    return undefined;
  }

  const objects: R2BackupObject[] = [];
  for (const key of keys) {
    const object = await bucket.get(key);
    if (!object) {
      continue;
    }

    objects.push({
      key,
      bodyBase64: arrayBufferToBase64(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType,
      cacheControl: object.httpMetadata?.cacheControl,
      contentDisposition: object.httpMetadata?.contentDisposition,
      contentEncoding: object.httpMetadata?.contentEncoding,
      cacheExpiry: object.httpMetadata?.cacheExpiry?.toISOString()
    });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    objects
  };
}

async function restoreBucketBackup(bucket: Bindings["BUCKET"], backup: unknown): Promise<void> {
  if (!bucket || !backup || typeof backup !== "object") {
    return;
  }

  const payload = backup as Partial<R2BackupPayload>;
  if (!Array.isArray(payload.objects)) {
    return;
  }

  for (const entry of payload.objects) {
    if (!entry || typeof entry.key !== "string" || typeof entry.bodyBase64 !== "string") {
      continue;
    }

    await bucket.put(entry.key, base64ToUint8Array(entry.bodyBase64), {
      httpMetadata: {
        contentType: entry.contentType,
        cacheControl: entry.cacheControl,
        contentDisposition: entry.contentDisposition,
        contentEncoding: entry.contentEncoding,
        cacheExpiry: entry.cacheExpiry ? new Date(entry.cacheExpiry) : undefined
      }
    });
  }
}

function buildInsertStatements(
  db: NonNullable<Bindings["DB"]>,
  tables: readonly string[],
  data: Record<string, Array<Record<string, unknown>>>
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  for (const table of tables) {
    const rows = data[table] || [];
    for (const row of rows) {
      const keys = Object.keys(row).map((key) => `"${key}"`).join(", ");
      const placeholders = Object.keys(row).map(() => "?").join(", ");
      const values = Object.values(row);
      statements.push(db.prepare(`INSERT INTO "${table}" (${keys}) VALUES (${placeholders})`).bind(...values));
    }
  }

  return statements;
}

export function createSqlConsoleRoutes(): Hono<SqlConsoleEnv> {
  const sqlRoutes = new Hono<SqlConsoleEnv>();

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
      }

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
    } catch (error: any) {
      console.error("SQL execute error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  sqlRoutes.get("/export-db", async (c) => {
    try {
      const data: SqlExportData = {};
      for (const table of FULL_DB_TABLES) {
        const { results } = await c.env.DB!.prepare(`SELECT * FROM "${table}"`).all<Record<string, unknown>>();
        data[table] = results ?? [];
      }

      const r2Backup = await exportBucketPrefixes(c.env.BUCKET, [...FULL_R2_PREFIXES]);
      if (r2Backup) {
        data.__r2 = r2Backup;
      }

      return c.json({ ok: true, data });
    } catch (error: any) {
      console.error("DB export error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  sqlRoutes.post("/import-db", async (c) => {
    try {
      const { data: rawData } = await c.req.json<{ data: Record<string, unknown> }>();
      if (!rawData || typeof rawData !== "object") {
        return c.json({ ok: false, error: "Invalid data format" }, 400);
      }

      const data = stripReservedFields(rawData);
      const statements: D1PreparedStatement[] = [];

      for (const table of [...FULL_DB_TABLES].reverse()) {
        statements.push(c.env.DB!.prepare(`DELETE FROM "${table}"`));
      }
      statements.push(...buildInsertStatements(c.env.DB!, FULL_DB_TABLES, data));

      await c.env.DB!.batch(statements);
      await deleteBucketPrefixes(c.env.BUCKET, [...FULL_R2_PREFIXES]);
      await restoreBucketBackup(c.env.BUCKET, rawData.__r2);
      return c.json({ ok: true, data: { success: true } });
    } catch (error: any) {
      console.error("DB import error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  sqlRoutes.get("/export-project/:projectId", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      const project = await c.env.DB!
        .prepare(`SELECT * FROM "projects" WHERE "id" = ?`)
        .bind(projectId)
        .first<Record<string, unknown>>();

      if (!project) {
        return c.json({ ok: false, error: "Project not found" }, 404);
      }

      const members = await c.env.DB!
        .prepare(`SELECT * FROM "project_members" WHERE "projectId" = ?`)
        .bind(projectId)
        .all<Record<string, unknown>>();
      const ships = await c.env.DB!
        .prepare(`SELECT * FROM "ships" WHERE "projectId" = ?`)
        .bind(projectId)
        .all<Record<string, unknown>>();
      const shipIds = (ships.results ?? []).map((ship) => String(ship.id));

      const exportData: SqlExportData = {
        projects: [project],
        project_members: members.results ?? [],
        ships: ships.results ?? [],
        inspection_items: [],
        inspection_rounds: [],
        comments: [],
        ncrs: [],
        ncr_index: [],
        observations: []
      };

      if (shipIds.length > 0) {
        const placeholders = shipIds.map(() => "?").join(", ");
        const items = await c.env.DB!
          .prepare(`SELECT * FROM "inspection_items" WHERE "shipId" IN (${placeholders})`)
          .bind(...shipIds)
          .all<Record<string, unknown>>();
        exportData.inspection_items = items.results ?? [];

        const itemIds = exportData.inspection_items.map((item) => String(item.id));
        if (itemIds.length > 0) {
          const itemPlaceholders = itemIds.map(() => "?").join(", ");
          const rounds = await c.env.DB!
            .prepare(`SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (${itemPlaceholders})`)
            .bind(...itemIds)
            .all<Record<string, unknown>>();
          const comments = await c.env.DB!
            .prepare(`SELECT * FROM "comments" WHERE "inspectionItemId" IN (${itemPlaceholders})`)
            .bind(...itemIds)
            .all<Record<string, unknown>>();
          exportData.inspection_rounds = rounds.results ?? [];
          exportData.comments = comments.results ?? [];
        }

        const ncrs = await c.env.DB!
          .prepare(`SELECT * FROM "ncrs" WHERE "shipId" IN (${placeholders})`)
          .bind(...shipIds)
          .all<Record<string, unknown>>();
        const ncrIndex = await c.env.DB!
          .prepare(`SELECT * FROM "ncr_index" WHERE "shipId" IN (${placeholders})`)
          .bind(...shipIds)
          .all<Record<string, unknown>>();
        const observations = await c.env.DB!
          .prepare(`SELECT * FROM "observations" WHERE "shipId" IN (${placeholders})`)
          .bind(...shipIds)
          .all<Record<string, unknown>>();

        exportData.ncrs = ncrs.results ?? [];
        exportData.ncr_index = ncrIndex.results ?? [];
        exportData.observations = observations.results ?? [];

        const r2Backup = await exportBucketPrefixes(c.env.BUCKET, getProjectR2Prefixes(shipIds));
        if (r2Backup) {
          exportData.__r2 = r2Backup;
        }
      }

      return c.json({ ok: true, data: exportData });
    } catch (error: any) {
      console.error("Project export error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  sqlRoutes.post("/import-project", async (c) => {
    try {
      const { data: rawData } = await c.req.json<{ data: Record<string, unknown> }>();
      const data = stripReservedFields(rawData ?? {});
      if (!Array.isArray(data.projects) || data.projects.length !== 1) {
        return c.json({ ok: false, error: "Invalid project export data format" }, 400);
      }

      const projectId = String(data.projects[0].id);
      const existingShipIds = (
        await c.env.DB!
          .prepare(`SELECT id FROM "ships" WHERE "projectId" = ?`)
          .bind(projectId)
          .all<Record<string, unknown>>()
      ).results.map((ship) => String(ship.id));
      const importedShipIds = (data.ships ?? []).map((ship) => String(ship.id));
      const allShipIds = Array.from(new Set([...existingShipIds, ...importedShipIds]));
      const statements: D1PreparedStatement[] = [];

      if (existingShipIds.length > 0) {
        const placeholders = existingShipIds.map(() => "?").join(", ");
        const itemIds = (
          await c.env.DB!
            .prepare(`SELECT id FROM "inspection_items" WHERE "shipId" IN (${placeholders})`)
            .bind(...existingShipIds)
            .all<Record<string, unknown>>()
        ).results.map((item) => String(item.id));

        if (itemIds.length > 0) {
          const itemPlaceholders = itemIds.map(() => "?").join(", ");
          statements.push(c.env.DB!.prepare(`DELETE FROM "comments" WHERE "inspectionItemId" IN (${itemPlaceholders})`).bind(...itemIds));
          statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_rounds" WHERE "inspectionItemId" IN (${itemPlaceholders})`).bind(...itemIds));
        }

        statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...existingShipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncr_index" WHERE "shipId" IN (${placeholders})`).bind(...existingShipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncrs" WHERE "shipId" IN (${placeholders})`).bind(...existingShipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "observations" WHERE "shipId" IN (${placeholders})`).bind(...existingShipIds));
      }

      statements.push(c.env.DB!.prepare(`DELETE FROM "ships" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "project_members" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "projects" WHERE "id" = ?`).bind(projectId));
      statements.push(...buildInsertStatements(c.env.DB!, PROJECT_EXPORT_TABLES, data));

      await c.env.DB!.batch(statements);
      await deleteBucketPrefixes(c.env.BUCKET, getProjectR2Prefixes(allShipIds));
      await restoreBucketBackup(c.env.BUCKET, rawData?.__r2);
      return c.json({ ok: true, data: { success: true } });
    } catch (error: any) {
      console.error("Project import error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  sqlRoutes.delete("/delete-project/:projectId", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      const statements: D1PreparedStatement[] = [];
      const shipIds = (
        await c.env.DB!
          .prepare(`SELECT id FROM "ships" WHERE "projectId" = ?`)
          .bind(projectId)
          .all<Record<string, unknown>>()
      ).results.map((ship) => String(ship.id));

      if (shipIds.length > 0) {
        const placeholders = shipIds.map(() => "?").join(", ");
        const itemIds = (
          await c.env.DB!
            .prepare(`SELECT id FROM "inspection_items" WHERE "shipId" IN (${placeholders})`)
            .bind(...shipIds)
            .all<Record<string, unknown>>()
        ).results.map((item) => String(item.id));

        if (itemIds.length > 0) {
          const itemPlaceholders = itemIds.map(() => "?").join(", ");
          statements.push(c.env.DB!.prepare(`DELETE FROM "comments" WHERE "inspectionItemId" IN (${itemPlaceholders})`).bind(...itemIds));
          statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_rounds" WHERE "inspectionItemId" IN (${itemPlaceholders})`).bind(...itemIds));
        }

        statements.push(c.env.DB!.prepare(`DELETE FROM "inspection_items" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncr_index" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "ncrs" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
        statements.push(c.env.DB!.prepare(`DELETE FROM "observations" WHERE "shipId" IN (${placeholders})`).bind(...shipIds));
      }

      statements.push(c.env.DB!.prepare(`DELETE FROM "ships" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "project_members" WHERE "projectId" = ?`).bind(projectId));
      statements.push(c.env.DB!.prepare(`DELETE FROM "projects" WHERE "id" = ?`).bind(projectId));

      await c.env.DB!.batch(statements);
      await deleteBucketPrefixes(c.env.BUCKET, getProjectR2Prefixes(shipIds));
      return c.json({ ok: true, data: { success: true } });
    } catch (error: any) {
      console.error("Project delete error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  return sqlRoutes;
}
