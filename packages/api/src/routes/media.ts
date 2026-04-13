import { Hono } from "hono";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";
import type { Bindings } from "../env.ts";
import {
  assertBucket,
  buildMediaFilename,
  getMediaObjectKey,
  getMediaVariantFilenames,
  getObjectFilename,
  getShipContextByShipId,
  hasProjectAccess,
  isDerivedMediaVariant,
  MEDIA_VARIANTS,
  sanitizeFilename,
  type MediaVariant
} from "../services/ncr-storage.ts";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

type MediaRouteEnv = { Bindings: Bindings; Variables: AuthContextVariables };

function isMediaVariant(value: string | null): value is MediaVariant {
  return !!value && MEDIA_VARIANTS.includes(value as MediaVariant);
}

export function createMediaRoutes(): Hono<MediaRouteEnv> {
  const routes = new Hono<MediaRouteEnv>();

  routes.use("*", createRequireAuth());


  routes.post("/upload", async (c) => {
    try {
      const authUser = c.get("authUser");
      const form = await c.req.formData();
      const shipId = String(form.get("shipId") ?? "").trim();
      const file = form.get("file");

      if (!shipId || !(file instanceof File)) {
        return c.json({ ok: false, error: "shipId and file are required" }, 400);
      }

      if (!file.type.startsWith("image/")) {
        return c.json({ ok: false, error: "Only image uploads are supported" }, 400);
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        return c.json({ ok: false, error: "Image exceeds 5MB limit" }, 400);
      }

      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const requestedVariant = String(form.get("variant") ?? "").trim() || null;
      const baseId = String(form.get("baseId") ?? "").trim() || crypto.randomUUID();
      const originalName = String(form.get("originalName") ?? file.name).trim() || file.name;
      const variant = isMediaVariant(requestedVariant) ? requestedVariant : null;
      const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".webp";
      const filename = variant
        ? buildMediaFilename(baseId, originalName, variant)
        : `${crypto.randomUUID()}-${sanitizeFilename(file.name.replace(/\.[^.]+$/, ""))}${extension}`;
      const objectKey = getMediaObjectKey(shipId, filename);
      const bucket = assertBucket(c.env);

      await bucket.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
          cacheControl: "private, max-age=31536000"
        }
      });

      return c.json({
        ok: true,
        data: {
          key: objectKey,
          filename,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          variant: variant ?? undefined
        }
      });
    } catch (error) {
      console.error("POST /media/upload error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:shipId/:filename", async (c) => {
    try {
      const authUser = c.get("authUser");
      const shipId = c.req.param("shipId");
      const filename = c.req.param("filename");
      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const bucket = assertBucket(c.env);
      const object = await bucket.get(getMediaObjectKey(shipId, filename));
      if (!object) {
        return c.json({ ok: false, error: "Media not found" }, 404);
      }

      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
      headers.set("Cache-Control", object.httpMetadata?.cacheControl ?? "private, max-age=31536000");
      headers.set("ETag", object.httpEtag);
      headers.set("Content-Disposition", `inline; filename="${getObjectFilename(filename)}"`);
      return new Response(await object.arrayBuffer(), { status: 200, headers });

    } catch (error) {
      console.error("GET /media/:shipId/:filename error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.delete("/:shipId/:filename", async (c) => {

    try {
      const authUser = c.get("authUser");
      const shipId = c.req.param("shipId");
      const filename = c.req.param("filename");
      const ship = await getShipContextByShipId(c.env.DB!, shipId);
      if (!ship) {
        return c.json({ ok: false, error: "Ship not found" }, 404);
      }

      const allowed = await hasProjectAccess(c.env.DB!, authUser, ship.projectId);
      if (!allowed) {
        return c.json({ ok: false, error: "forbidden" }, 403);
      }

      const bucket = assertBucket(c.env);
      for (const candidate of getMediaVariantFilenames(filename)) {
        await bucket.delete(getMediaObjectKey(shipId, candidate));
      }
      return c.json({ ok: true, data: { deleted: true } });
    } catch (error) {
      console.error("DELETE /media/:shipId/:filename error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  routes.get("/:shipId", async (c) => {
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

      const bucket = assertBucket(c.env);
      const listed = await bucket.list({ prefix: `media/${shipId}/` });
      return c.json({
        ok: true,
        data: listed.objects
          .map((entry) => entry.key)
          .filter((key) => !isDerivedMediaVariant(getObjectFilename(key)))
      });
    } catch (error) {
      console.error("GET /media/:shipId error:", error);
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  return routes;
}
