/**
 * The HTTP application the local server runs: the API (src/index.ts) plus,
 * optionally, the built web app (NBINS_WEB_DIST) under NBINS_WEB_BASE with SPA
 * fallback to index.html. Kept separate from server.ts so tests can drive it
 * with `app.request(...)` without opening a port.
 *
 * Routes:
 *   /health, /api/*                    the API (what the web app calls by default)
 *   <base>health, <base>api/*          the same API under the web base, for builds
 *                                      made with VITE_NBINS_API_BASE_URL=<base>api
 *   <base>assets/*, <base><file>       static files from the web dist
 *   <base>... (anything else, GET)     index.html (client-side routes such as
 *                                      <base>inspections/:itemId)
 *   <base without slash>               redirect to <base>
 */
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { Hono } from "hono";
import type { Bindings } from "./env.ts";
import app from "./index.ts";

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

export interface ServerAppOptions {
  /** Absolute path of the built web app (packages/web/dist), or null to serve the API only. */
  webDistDir: string | null;
  /** URL base of the web app, with leading and trailing slash (e.g. "/nbins/"). */
  webBasePath: string;
}

/** Resolve `relativePath` inside `root`; null if it would escape root. */
export function resolveInside(root: string, relativePath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const full = normalize(join(root, decoded));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return full === root || full.startsWith(rootWithSep) ? full : null;
}

async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? await readFile(path) : null;
  } catch {
    return null;
  }
}

function forwardToApi(request: Request, base: string): Request {
  const url = new URL(request.url);
  url.pathname = "/" + url.pathname.slice(base.length);
  return new Request(url, request);
}

export function createServerApp(options: ServerAppOptions): Hono<{ Bindings: Bindings }> {
  const server = new Hono<{ Bindings: Bindings }>();
  const base = options.webBasePath;

  if (base !== "/") {
    // The API under the web base as well (…/nbins/api/* -> /api/*).
    server.all(`${base}api/*`, (c) => app.fetch(forwardToApi(c.req.raw, base), c.env));
    server.get(`${base}health`, (c) => app.fetch(forwardToApi(c.req.raw, base), c.env));
  }

  if (options.webDistDir) {
    const root = normalize(options.webDistDir);
    const indexPath = join(root, "index.html");

    const serveIndex = async () => {
      const html = await readFileIfExists(indexPath);
      if (!html) {
        return new Response("Web app not built: index.html missing in NBINS_WEB_DIST", { status: 503 });
      }
      return new Response(new Uint8Array(html), {
        headers: { "content-type": STATIC_TYPES[".html"], "cache-control": "no-cache" }
      });
    };

    if (base !== "/") {
      server.get(base.slice(0, -1), (c) => c.redirect(base, 301));
    }

    server.on(["GET", "HEAD"], `${base}*`, async (c, next) => {
      const pathname = new URL(c.req.url).pathname;
      if (base === "/" && (pathname.startsWith("/api/") || pathname === "/health")) {
        return next();
      }

      const relativePath = pathname.slice(base.length);
      if (relativePath && !relativePath.endsWith("/")) {
        const filePath = resolveInside(root, relativePath);
        if (filePath && filePath !== indexPath) {
          const body = await readFileIfExists(filePath);
          if (body) {
            const hashedAsset = relativePath.startsWith("assets/");
            return new Response(new Uint8Array(body), {
              headers: {
                "content-type": STATIC_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
                "cache-control": hashedAsset ? "public, max-age=31536000, immutable" : "no-cache"
              }
            });
          }
        }

        // A missing file with an extension (e.g. a stale /assets/x.js) is a real 404,
        // not a client route: returning index.html there breaks module loading.
        if (extname(relativePath)) {
          return c.text("Not Found", 404);
        }
      }

      return serveIndex();
    });
  }

  server.route("/", app);
  return server;
}
