import { Hono } from "hono";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";
import type { Bindings } from "../env.ts";
import type { NcrRelatedFile } from "@nbins/shared";
import {
  assertBucket,
  getNcrFileObjectKey,
  getObjectFilename,
  hasProjectAccess,
  readStoredNcrById,
  type StoredNcrRecord,
  upsertNcrIndex,
  writeStoredNcr
} from "../services/ncr-storage.ts";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "zip", "jpg", "jpeg", "png", "webp", "txt"]);

type NcrFileRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function getExtension(filename: string): string {
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  return extension;
}

function canPreview(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf" || contentType.startsWith("text/");
}

function canDelete(authUserId: string, role: string, file: NcrRelatedFile): boolean {
  return role === "admin" || role === "manager" || authUserId === file.uploadedBy;
}

export function createNcrFileRoutes(): Hono<NcrFileRouteEnv> {
  const routes = new Hono<NcrFileRouteEnv>();

  routes.use("*", createRequireAuth());

  routes.post("/:id/files", async (c) => {
    try {
      const authUser = c.get("authUser");
      const record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return c.json({ ok: false, error: "file is required" }, 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return c.json({ ok: false, error: "File exceeds 20MB limit" }, 400);
      }

      const extension = getExtension(file.name);
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return c.json({ ok: false, error: `Unsupported file type: ${extension || "unknown"}` }, 400);
      }

      const bucket = assertBucket(c.env);
      const fileId = crypto.randomUUID();
      const objectKey = getNcrFileObjectKey(record.shipId, record.id, fileId, file.name);
      await bucket.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: file.type || "application/octet-stream"
        }
      });

      const uploaded: NcrRelatedFile = {
        id: fileId,
        name: file.name,
        objectKey,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        uploadedBy: authUser.id,
        uploadedAt: new Date().toISOString()
      };

      const nextRecord: StoredNcrRecord = {
        ...record,
        relatedFiles: [...record.relatedFiles, uploaded],
        updatedAt: new Date().toISOString()
      };

      await writeStoredNcr(c.env, nextRecord);
      await upsertNcrIndex(c.env, nextRecord);
      return c.json({ ok: true, data: uploaded });
    } catch (error) {
      console.error("POST /ncrs/:id/files error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:id/files", async (c) => {
    try {
      const authUser = c.get("authUser");
      const record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      return c.json({ ok: true, data: record.relatedFiles });
    } catch (error) {
      console.error("GET /ncrs/:id/files error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:id/files/:fileId", async (c) => {
    try {
      const authUser = c.get("authUser");
      const record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const target = record.relatedFiles.find((file) => file.id === c.req.param("fileId"));
      if (!target) {
        return c.json({ ok: false, error: "File not found" }, 404);
      }

      const bucket = assertBucket(c.env);
      const object = await bucket.get(target.objectKey);
      if (!object) {
        return c.json({ ok: false, error: "File object missing" }, 404);
      }

      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType ?? target.contentType ?? "application/octet-stream");
      headers.set(
        "Content-Disposition",
        `${canPreview(target.contentType) ? "inline" : "attachment"}; filename="${getObjectFilename(target.name)}"`
      );
      headers.set("ETag", object.httpEtag);
      return new Response(await object.arrayBuffer(), { status: 200, headers });

    } catch (error) {
      console.error("GET /ncrs/:id/files/:fileId error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.delete("/:id/files/:fileId", async (c) => {
    try {
      const authUser = c.get("authUser");
      const record = await readStoredNcrById(c.env, c.req.param("id"));
      if (!record) {
        return c.json({ ok: false, error: "NCR not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, record.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const target = record.relatedFiles.find((file) => file.id === c.req.param("fileId"));
      if (!target) {
        return c.json({ ok: false, error: "File not found" }, 404);
      }

      if (!canDelete(authUser.id, authUser.role, target)) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const bucket = assertBucket(c.env);
      await bucket.delete(target.objectKey);

      const nextRecord: StoredNcrRecord = {
        ...record,
        relatedFiles: record.relatedFiles.filter((file) => file.id !== target.id),
        updatedAt: new Date().toISOString()
      };

      await writeStoredNcr(c.env, nextRecord);
      await upsertNcrIndex(c.env, nextRecord);
      return c.json({ ok: true, data: { deleted: true } });
    } catch (error) {
      console.error("DELETE /ncrs/:id/files/:fileId error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  return routes;
}
