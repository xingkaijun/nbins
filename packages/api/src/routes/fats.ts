import { Hono } from "hono";
import type { CreateFatRequest, FatItemResponse, UpdateFatRequest } from "@nbins/shared";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables, AuthenticatedUser } from "../auth.ts";
import type { Bindings } from "../env.ts";
import type { FatIndexRecord } from "../persistence/records.ts";
import {
  computeFatResult,
  getFatIndexById,
  getFatObjectKey,
  getShipContextByShipId,
  hasProjectAccess,
  hydrateFatResponses,
  queryFatIndex,
  readStoredFatById,
  readStoredFatByIndex,
  type StoredFatRecord,
  upsertFatIndex,
  writeStoredFat,
  deleteFatIndex,
  getNextFatSerialNo,
  assertBucket
} from "../services/fat-storage.ts";

function generateId(): string {
  return crypto.randomUUID();
}

type FatRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

async function loadAuthorizedFat(
  env: Bindings,
  authUser: AuthenticatedUser,
  id: string
): Promise<{ indexRow: FatIndexRecord; record: StoredFatRecord } | null | "forbidden"> {
  const indexRow = await getFatIndexById(env, id);
  if (!indexRow) {
    return null;
  }

  const allowed = await hasProjectAccess(env.DB!, authUser, indexRow.projectId);
  if (!allowed) {
    return "forbidden";
  }

  const record = await readStoredFatByIndex(env, indexRow);
  if (!record) {
    return null;
  }

  return { indexRow, record };
}

async function respondWithHydrated(c: { env: Bindings }, record: StoredFatRecord): Promise<FatItemResponse> {
  const hydrated = await hydrateFatResponses(c.env, [record]);
  return hydrated[0];
}

export function createFatRoutes(): Hono<FatRouteEnv> {
  const routes = new Hono<FatRouteEnv>();

  routes.use("*", createRequireAuth());

  routes.get("/", async (c) => {
    try {
      const authUser = c.get("authUser");
      const projectId = c.req.query("projectId")?.trim() || undefined;
      const shipId = c.req.query("shipId")?.trim() || undefined;
      const keyword = c.req.query("keyword")?.trim() || undefined;
      const indexRows = await queryFatIndex(c.env, authUser, {
        projectId,
        shipId,
        keyword
      });

      const records = (await Promise.all(indexRows.map((row) => readStoredFatByIndex(c.env, row))))
        .filter((entry): entry is StoredFatRecord => entry !== null);
      const hydrated = await hydrateFatResponses(c.env, records);
      return c.json({ ok: true, data: hydrated });
    } catch (error) {
      console.error("GET /fats error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/meta/next-serial", async (c) => {
    try {
      const authUser = c.get("authUser");
      const shipId = c.req.query("shipId")?.trim();
      if (!shipId) {
        return c.json({ ok: false, error: "shipId is required" }, 400);
      }

      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const serial = await getNextFatSerialNo(c.env, shipId);
      const formatted = `FAT-${ship.hullNumber ?? shipId}-${String(serial).padStart(3, "0")}`;
      return c.json({ ok: true, data: { serial, formatted } });
    } catch (error) {
      console.error("GET /fats/meta/next-serial error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const loaded = await loadAuthorizedFat(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "FAT not found" }, 404);
      }

      return c.json({ ok: true, data: await respondWithHydrated(c, loaded.record) });
    } catch (error) {
      console.error("GET /fats/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.post("/ships/:shipId", async (c) => {
    try {
      const authUser = c.get("authUser");
      const shipId = c.req.param("shipId");
      const body = await c.req.json<CreateFatRequest>();
      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const title = body.title?.trim();
      const content = body.content?.trim() || "";
      if (!title) {
        return c.json({ ok: false, error: "title is required" }, 400);
      }

      const now = new Date().toISOString();
      const serialNo = body.serialNo ?? (await getNextFatSerialNo(c.env, shipId));
      const discipline = body.discipline?.trim() || "GENERAL";
      const comments = Array.isArray(body.comments) ? body.comments : [];
      const record: StoredFatRecord = {
        id: generateId(),
        projectId: ship.projectId,
        shipId,
        title,
        discipline,
        serialNo,
        content,
        result: computeFatResult(comments, body.result?.trim() || null),
        comments,
        remark: comments.length > 0 ? comments.map((c) => c.content).join("; ") : null,
        maker: body.maker?.trim() || null,
        inspectionDate: body.inspectionDate?.trim() || null,
        authorId: authUser.id,
        imageAttachments: Array.isArray(body.imageAttachments)
          ? body.imageAttachments.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          : [],
        createdAt: now,
        updatedAt: now
      };

      await writeStoredFat(c.env, record);
      await upsertFatIndex(c.env, record);

      return c.json({ ok: true, data: await respondWithHydrated(c, record) });
    } catch (error) {
      console.error("POST /fats/ships/:shipId error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<UpdateFatRequest>();
      const loaded = await loadAuthorizedFat(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "FAT not found" }, 404);
      }

      const nextComments = body.comments !== undefined ? body.comments : loaded.record.comments;
      const manualResult = body.result !== undefined ? (body.result?.trim() || null) : loaded.record.result;
      const nextRecord: StoredFatRecord = {
        ...loaded.record,
        title: body.title !== undefined ? body.title.trim() || loaded.record.title : loaded.record.title,
        discipline: body.discipline !== undefined ? body.discipline.trim() || loaded.record.discipline : loaded.record.discipline,
        content: body.content !== undefined ? body.content.trim() || loaded.record.content : loaded.record.content,
        result: computeFatResult(nextComments, manualResult),
        comments: nextComments,
        remark: nextComments.length > 0 ? nextComments.map((c) => c.content).join("; ") : null,
        maker: body.maker !== undefined ? (body.maker?.trim() || null) : loaded.record.maker,
        imageAttachments: body.imageAttachments !== undefined
          ? body.imageAttachments.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          : loaded.record.imageAttachments,
        updatedAt: new Date().toISOString()
      };

      await writeStoredFat(c.env, nextRecord);
      await upsertFatIndex(c.env, nextRecord);
      return c.json({ ok: true, data: await respondWithHydrated(c, nextRecord) });
    } catch (error) {
      console.error("PUT /fats/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.delete("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const loaded = await loadAuthorizedFat(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "FAT not found" }, 404);
      }

      // Only admin/manager or the original author can delete
      if (authUser.role !== "admin" && authUser.role !== "manager" && authUser.id !== loaded.record.authorId) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const bucket = assertBucket(c.env);
      const { record } = loaded;

      // Delete R2 objects: FAT JSON
      await bucket.delete(getFatObjectKey(record.shipId, record.id));

      // Delete D1 index
      await deleteFatIndex(c.env, record.id);

      return c.json({ ok: true, data: { deleted: true } });
    } catch (error) {
      console.error("DELETE /fats/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  return routes;
}
