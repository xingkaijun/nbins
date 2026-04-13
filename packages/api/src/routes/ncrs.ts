import { Hono } from "hono";
import type { ApproveNcrRequest, CloseNcrRequest, CreateNcrRequest, NcrItemResponse, UpdateNcrRequest } from "@nbins/shared";
import { createRequireAuth, createRequireRole } from "../auth.ts";
import type { AuthContextVariables, AuthenticatedUser } from "../auth.ts";
import type { Bindings } from "../env.ts";
import type { NcrIndexRecord } from "../persistence/records.ts";
import { generateNcrPdfForRecord } from "./ncr-pdf.ts";
import {

  assertBucket,
  getNcrIndexById,
  getNcrObjectKey,
  getShipContextByShipId,
  hasProjectAccess,
  hydrateNcrResponses,
  queryNcrIndex,
  readStoredNcrById,
  readStoredNcrByIndex,
  type StoredNcrRecord,
  upsertNcrIndex,
  writeStoredNcr,
  deleteNcrIndex,
  getNextNcrSerialNo
} from "../services/ncr-storage.ts";

function generateId(): string {

  return crypto.randomUUID();
}

function isValidStatus(value: string | undefined): value is StoredNcrRecord["status"] {
  return value === "draft" || value === "pending_approval" || value === "approved" || value === "rejected";
}

type NcrRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

async function loadAuthorizedNcr(
  env: Bindings,
  authUser: AuthenticatedUser,
  id: string
): Promise<{ indexRow: NcrIndexRecord; record: StoredNcrRecord } | null | "forbidden"> {
  const indexRow = await getNcrIndexById(env, id);
  if (!indexRow) {
    return null;
  }

  const allowed = await hasProjectAccess(env.DB!, authUser, indexRow.projectId);
  if (!allowed) {
    return "forbidden";
  }

  const record = await readStoredNcrByIndex(env, indexRow);
  if (!record) {
    return null;
  }

  return { indexRow, record };
}

async function respondWithHydrated(c: { env: Bindings }, record: StoredNcrRecord): Promise<NcrItemResponse> {
  const hydrated = await hydrateNcrResponses(c.env, [record]);
  return hydrated[0];
}

function toWebhookNcrPayload(record: StoredNcrRecord): StoredNcrRecord & { attachments: string[] } {
  return {
    ...record,
    attachments: record.imageAttachments
  };
}

export function createNcrRoutes(): Hono<NcrRouteEnv> {
  const routes = new Hono<NcrRouteEnv>();
  const requireAdminOrManager = createRequireRole<NcrRouteEnv>(["admin", "manager"]);

  routes.use("*", createRequireAuth());

  routes.get("/", async (c) => {
    try {
      const authUser = c.get("authUser");
      const projectId = c.req.query("projectId")?.trim() || undefined;
      const shipId = c.req.query("shipId")?.trim() || undefined;
      const keyword = c.req.query("keyword")?.trim() || undefined;
      const status = c.req.query("status")?.trim();
      const indexRows = await queryNcrIndex(c.env, authUser, {
        projectId,
        shipId,
        keyword,
        status: isValidStatus(status) ? status : undefined
      });

      const records = (await Promise.all(indexRows.map((row) => readStoredNcrByIndex(c.env, row))))
        .filter((entry): entry is StoredNcrRecord => entry !== null);
      const hydrated = await hydrateNcrResponses(c.env, records);
      return c.json({ ok: true, data: hydrated });
    } catch (error) {
      console.error("GET /ncrs error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/ships/:shipId", async (c) => {
    try {
      const authUser = c.get("authUser");
      const shipId = c.req.param("shipId");
      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const keyword = c.req.query("keyword")?.trim() || undefined;
      const status = c.req.query("status")?.trim();
      const indexRows = await queryNcrIndex(c.env, authUser, {
        projectId: ship.projectId,
        shipId,
        keyword,
        status: isValidStatus(status) ? status : undefined
      });

      const records = (await Promise.all(indexRows.map((row) => readStoredNcrByIndex(c.env, row))))
        .filter((entry): entry is StoredNcrRecord => entry !== null);
      const hydrated = await hydrateNcrResponses(c.env, records);
      return c.json({ ok: true, data: hydrated });
    } catch (error) {
      console.error("GET /ncrs/ships/:shipId error:", error);
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

      const serial = await getNextNcrSerialNo(c.env, shipId);
      const formatted = `NCR-${ship.hullNumber ?? shipId}-${String(serial).padStart(3, "0")}`;
      return c.json({ ok: true, data: { serial, formatted } });
    } catch (error) {
      console.error("GET /ncrs/meta/next-serial error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/next-serial", async (c) => {
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

      const serial = await getNextNcrSerialNo(c.env, shipId);
      const formatted = `NCR-${ship.hullNumber ?? shipId}-${String(serial).padStart(3, "0")}`;
      return c.json({ ok: true, data: { serial, formatted } });
    } catch (error) {
      console.error("GET /ncrs/next-serial error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });


  routes.get("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      return c.json({ ok: true, data: await respondWithHydrated(c, loaded.record) });
    } catch (error) {
      console.error("GET /ncrs/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.post("/ships/:shipId", async (c) => {
    try {
      const authUser = c.get("authUser");
      const shipId = c.req.param("shipId");
      const body = await c.req.json<CreateNcrRequest>();
      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const title = body.title?.trim();
      const content = body.content?.trim();
      if (!title || !content) {
        return c.json({ ok: false, error: "title and content are required" }, 400);
      }

      const now = new Date().toISOString();
      const serialNo = body.serialNo ?? (await getNextNcrSerialNo(c.env, shipId));
      const discipline = body.discipline?.trim() || "GENERAL";
      const record: StoredNcrRecord = {
        id: generateId(),
        projectId: ship.projectId,
        shipId,
        title,
        discipline,
        serialNo,
        content,
        remark: body.remark?.trim() || null,
        authorId: authUser.id,
        status: "pending_approval",
        approvedBy: null,
        approvedAt: null,

        imageAttachments: Array.isArray(body.imageAttachments)
          ? body.imageAttachments.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          : [],
        relatedFiles: [],
        pdf: null,
        rectifyRequest: body.rectifyRequest?.trim() || null,
        builderReply: null,
        replyDate: null,
        verifiedBy: null,
        verifyDate: null,
        closedBy: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now
      };

      await writeStoredNcr(c.env, record);
      await upsertNcrIndex(c.env, record);

      return c.json({ ok: true, data: await respondWithHydrated(c, record) });
    } catch (error) {
      console.error("POST /ncrs/ships/:shipId error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<UpdateNcrRequest>();
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const nextRecord: StoredNcrRecord = {
        ...loaded.record,
        title: body.title !== undefined ? body.title.trim() || loaded.record.title : loaded.record.title,
        discipline: body.discipline !== undefined ? body.discipline.trim() || loaded.record.discipline : loaded.record.discipline,
        content: body.content !== undefined ? body.content.trim() || loaded.record.content : loaded.record.content,
        remark: body.remark !== undefined ? (body.remark?.trim() || null) : loaded.record.remark,
        imageAttachments: body.imageAttachments !== undefined
          ? body.imageAttachments.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          : loaded.record.imageAttachments,
        builderReply: body.builderReply !== undefined ? body.builderReply : loaded.record.builderReply,
        replyDate: body.replyDate !== undefined ? body.replyDate : loaded.record.replyDate,
        verifiedBy: body.verifiedBy !== undefined ? body.verifiedBy : loaded.record.verifiedBy,
        verifyDate: body.verifyDate !== undefined ? body.verifyDate : loaded.record.verifyDate,
        rectifyRequest: body.rectifyRequest !== undefined ? (body.rectifyRequest?.trim() || null) : loaded.record.rectifyRequest,
        updatedAt: new Date().toISOString()
      };


      await writeStoredNcr(c.env, nextRecord);
      await upsertNcrIndex(c.env, nextRecord);
      return c.json({ ok: true, data: await respondWithHydrated(c, nextRecord) });
    } catch (error) {
      console.error("PUT /ncrs/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.put("/:id/remark", async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<{ remark?: string | null }>();
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const nextRecord: StoredNcrRecord = {
        ...loaded.record,
        remark: body.remark?.trim() || null,
        updatedAt: new Date().toISOString()
      };

      await writeStoredNcr(c.env, nextRecord);
      await upsertNcrIndex(c.env, nextRecord);
      return c.json({ ok: true, data: await respondWithHydrated(c, nextRecord) });
    } catch (error) {
      console.error("PUT /ncrs/:id/remark error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.put("/:id/approve", requireAdminOrManager, async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<ApproveNcrRequest>();
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      if (loaded.record.status !== "pending_approval") {
        return c.json({ ok: false, error: "Only NCRs pending approval can be published or rejected" }, 409);
      }

      const now = new Date().toISOString();
      let nextRecord: StoredNcrRecord = {
        ...loaded.record,
        status: body.approved ? "approved" : "rejected",
        approvedBy: body.approved ? authUser.id : null,
        approvedAt: body.approved ? now : null,
        updatedAt: now
      };


      if (body.approved) {
        nextRecord = await generateNcrPdfForRecord(c.env, nextRecord);
      } else {
        await writeStoredNcr(c.env, nextRecord);
        await upsertNcrIndex(c.env, nextRecord);
      }

      if (body.approved) {

        c.executionCtx.waitUntil((async () => {
          const webhookUrl = c.env.N8N_WEBHOOK_URL;
          if (!webhookUrl) {
            return;
          }

          try {
            const project = await c.env.DB!
              .prepare('SELECT "ncrRecipients" FROM "projects" WHERE "id" = ?')
              .bind(nextRecord.projectId)
              .first<Record<string, unknown>>();

            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "ncr_approved",
                data: {
                  ncr: toWebhookNcrPayload(nextRecord),
                  shipId: nextRecord.shipId,
                  ncrRecipients: project?.ncrRecipients || "[]"
                }
              })
            });
          } catch (error) {
            console.error("Failed to trigger NCR approval webhook", error);
          }
        })());
      }

      return c.json({ ok: true, data: await respondWithHydrated(c, nextRecord) });
    } catch (error) {
      console.error("PUT /ncrs/:id/approve error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.delete("/:id", async (c) => {
    try {
      const authUser = c.get("authUser");
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      // Only admin/manager or the original author can delete
      if (authUser.role !== "admin" && authUser.role !== "manager" && authUser.id !== loaded.record.authorId) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const bucket = assertBucket(c.env);
      const { record } = loaded;

      // Delete R2 objects: NCR JSON, related files, PDF
      const keysToDelete: string[] = [
        getNcrObjectKey(record.shipId, record.id)
      ];
      for (const file of record.relatedFiles) {
        keysToDelete.push(file.objectKey);
      }
      if (record.pdf?.objectKey) {
        keysToDelete.push(record.pdf.objectKey);
      }
      // Also delete image attachments from media (without variants for now)
      // Note: image variants are shared resources, skip auto-delete to avoid breaking other NCRs

      for (const key of keysToDelete) {
        await bucket.delete(key);
      }

      // Delete D1 index
      await deleteNcrIndex(c.env, record.id);

      return c.json({ ok: true, data: { deleted: true } });
    } catch (error) {
      console.error("DELETE /ncrs/:id error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.put("/:id/close", async (c) => {
    try {
      const authUser = c.get("authUser");
      const body = await c.req.json<CloseNcrRequest>();
      const loaded = await loadAuthorizedNcr(c.env, authUser, c.req.param("id"));
      if (loaded === "forbidden") {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }
      if (!loaded) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const now = new Date().toISOString();
      const nextRecord: StoredNcrRecord = {
        ...loaded.record,
        closedBy: body.closed ? authUser.id : null,
        closedAt: body.closed ? now : null,
        updatedAt: now
      };

      await writeStoredNcr(c.env, nextRecord);
      await upsertNcrIndex(c.env, nextRecord);
      return c.json({ ok: true, data: await respondWithHydrated(c, nextRecord) });
    } catch (error) {
      console.error("PUT /ncrs/:id/close error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });



  return routes;
}
