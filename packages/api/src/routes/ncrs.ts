import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { NcrRecord } from "../persistence/records.ts";
import type { CreateNcrRequest, ApproveNcrRequest, NcrItemResponse } from "@nbins/shared";
import { createRequireAuth, createRequireRole } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";

function generateId(): string {
  return crypto.randomUUID();
}

function mapNcrRecord(row: Record<string, unknown>): NcrRecord {
  const attachmentsRaw = row.attachments;
  let attachments: string[] = [];
  if (typeof attachmentsRaw === "string") {
    try {
      attachments = JSON.parse(attachmentsRaw);
      if (!Array.isArray(attachments)) attachments = [];
    } catch {
      attachments = [];
    }
  }

  return {
    id: String(row.id),
    shipId: String(row.shipId),
    title: String(row.title),
    content: String(row.content),
    authorId: String(row.authorId),
    status: row.status as NcrRecord["status"],
    approvedBy: typeof row.approvedBy === "string" ? row.approvedBy : null,
    approvedAt: typeof row.approvedAt === "string" ? row.approvedAt : null,
    attachments,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

type NcrRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

export function createNcrRoutes(): Hono<NcrRouteEnv> {
  const routes = new Hono<NcrRouteEnv>();
  
  routes.use("*", createRequireAuth());

  // 角色守卫
  const requireAdminOrManager = createRequireRole<NcrRouteEnv>(["admin", "manager"]);

  // Helper fetching ncr response fully hydrated
  async function hydrateNcrs(ncrs: NcrRecord[], env: Bindings): Promise<NcrItemResponse[]> {
    if (ncrs.length === 0) return [];
    
    let userMap = new Map<string, string>();
    const authorIds = Array.from(new Set(ncrs.map(n => n.authorId).concat(ncrs.map(n => n.approvedBy).filter(Boolean) as string[])));
    if (authorIds.length > 0) {
      const placeholders = authorIds.map(() => "?").join(",");
      const users = await env.DB!.prepare(`SELECT "id", "displayName" FROM "users" WHERE "id" IN (${placeholders})`).bind(...authorIds).all<{ id: string, displayName: string }>();
      if (users.results) {
        for (const u of users.results) userMap.set(u.id, u.displayName);
      }
    }

    return ncrs.map(n => ({
      ...n,
      authorName: userMap.get(n.authorId),
      approvedByName: n.approvedBy ? userMap.get(n.approvedBy) : undefined
    }));
  }

  routes.get("/ships/:shipId", async (c) => {
    try {
      const shipId = c.req.param("shipId");

      const result = await c.env.DB!
        .prepare(`SELECT * FROM "ncrs" WHERE "shipId" = ? ORDER BY "createdAt" DESC`)
        .bind(shipId)
        .all<Record<string, unknown>>();
      const ncrs = (result.results ?? []).map(mapNcrRecord);

      const hydrated = await hydrateNcrs(ncrs, c.env);
      return c.json({ ok: true, data: hydrated });

    } catch (e: any) {
      console.error("GET /ncrs error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/ships/:shipId", async (c) => {
    try {
      const shipId = c.req.param("shipId");
      const body = await c.req.json<CreateNcrRequest>();
      
      const authorId = c.get("authUser").id;
      
      const now = new Date().toISOString();
      const ncr: NcrRecord = {
        id: generateId(),
        shipId,
        title: body.title,
        content: body.content,
        authorId,
        status: "pending_approval",
        approvedBy: null,
        approvedAt: null,
        attachments: [],
        createdAt: now,
        updatedAt: now
      };

      await c.env.DB!
        .prepare(
          `INSERT INTO "ncrs" ("id", "shipId", "title", "content", "authorId", "status", "approvedBy", "approvedAt", "attachments", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ncr.id, ncr.shipId, ncr.title, ncr.content, ncr.authorId,
          ncr.status, ncr.approvedBy, ncr.approvedAt, JSON.stringify(ncr.attachments),
          ncr.createdAt, ncr.updatedAt
        )
        .run();

      const hydrated = await hydrateNcrs([ncr], c.env);
      return c.json({ ok: true, data: hydrated[0] });

    } catch (e: any) {
      console.error("POST /ncrs error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id/approve", requireAdminOrManager, async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<ApproveNcrRequest>();
      
      const approvedBy = c.get("authUser").id;
      const now = new Date().toISOString();
      
      const newStatus = body.approved ? "approved" : "rejected";
      let targetNcr: NcrRecord | undefined;
      let projectPayload: any;

      const row = await c.env.DB!.prepare(`SELECT * FROM "ncrs" WHERE "id" = ?`).bind(id).first<Record<string, unknown>>();
      if (!row) return c.json({ ok: false, error: "NCR not found" }, 404);
      
      await c.env.DB!
        .prepare(`UPDATE "ncrs" SET "status" = ?, "approvedBy" = ?, "approvedAt" = ?, "updatedAt" = ? WHERE "id" = ?`)
        .bind(newStatus, approvedBy, now, now, id)
        .run();
        
      targetNcr = mapNcrRecord({ ...row, status: newStatus, approvedBy, approvedAt: now, updatedAt: now });

      // Grab project for webhook
      const ship = await c.env.DB!.prepare(`SELECT * FROM "ships" WHERE "id" = ?`).bind(targetNcr.shipId).first<Record<string, unknown>>();
      if (ship) {
        projectPayload = await c.env.DB!.prepare(`SELECT * FROM "projects" WHERE "id" = ?`).bind(ship.projectId as string).first<Record<string, unknown>>();
      }

      // TRIGER WEBHOOK IF APPROVED
      if (body.approved && targetNcr) {
        c.executionCtx.waitUntil(
          (async () => {
            const webhookUrl = c.env.N8N_WEBHOOK_URL;
            if (!webhookUrl) {
              console.log("No n8n webhook URL configured. Skipping PDF generation and email push.");
              return;
            }
            try {
              const payload = {
                event: "ncr_approved",
                data: {
                  ncr: targetNcr,
                  shipId: targetNcr.shipId,
                  ncrRecipients: projectPayload?.ncrRecipients || "[]"
                }
              };
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
              console.log("Successfully triggered n8n webhook for NCR", targetNcr.id);
            } catch (whErr) {
              console.error("Failed to trigger N8N Webhook", whErr);
            }
          })()
        );
      }

      const hydrated = await hydrateNcrs([targetNcr], c.env);
      return c.json({ ok: true, data: hydrated[0] });

    } catch (e: any) {
      console.error("PUT /ncrs/approve error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}
