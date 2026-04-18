import { Hono } from "hono";
import { cors } from "hono/cors";
import { DISCIPLINES } from "@nbins/shared";
import type { Bindings } from "./env.ts";
import { createInspectionStorageResolver } from "./persistence/storage-factory.ts";
import { createAuthRoutes } from "./routes/auth.ts";
import { devRoutes } from "./routes/dev.ts";
import { createInspectionRoutes } from "./routes/inspections.ts";
import { createObservationRoutes } from "./routes/observations.ts";
import { createObservationTypeRoutes } from "./routes/observation-types.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createShipRoutes } from "./routes/ships.ts";
import { createUserRoutes } from "./routes/users.ts";
import { createMediaRoutes } from "./routes/media.ts";
import { createNcrRoutes } from "./routes/ncrs.ts";
import { createNcrFileRoutes } from "./routes/ncr-files.ts";
import { createNcrPdfRoutes } from "./routes/ncr-pdf.ts";
import { createSqlConsoleRoutes } from "./routes/sql-console.ts";


function createApp(): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  const resolveStorage = createInspectionStorageResolver();

  // 允许所有本地开发端口和本地域名进行跨域请求
  app.use(
    "/api/*",
    cors({
      origin: [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://192.168.190.129:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "https://ins.6666996.xyz",
        "https://nbins-six.vercel.app",
        // Cloudflare Pages 域名（部署后添加）
        "https://nbins-web.pages.dev",
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  );

  app.get("/health", (c) => {
    return c.json({
      ok: true,
      service: "nbins-api",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/meta", (c) => {
    return c.json({
      appName: c.env.APP_NAME ?? "NBINS",
      environment: c.env.APP_ENV ?? "development",
      storageMode: "d1+r2",
      generatedAt: new Date().toISOString(),
      disciplines: DISCIPLINES.filter((d: string) => d !== "all"),
      routes: [
        "/health",
        "/api/meta",
        "/api/auth/login",
        "/api/auth/me",
        "/api/inspections",
        "/api/inspections/:id",
        "/api/inspections/:id/rounds/current/result",
        "/api/inspections/:id/comments/:commentId/resolve",
        "/api/observation-types",
        "/api/observation-types/:id",
        "/api/ships/:shipId/observations",
        "/api/observations/:id",
        "/api/observations/:id/close",
        "/api/observations/:id/reopen",
        "/api/projects",
        "/api/projects/:id",
        "/api/ships",
        "/api/ships/:id",
        "/api/users",
        "/api/users/:id",
        "/api/users/:id/password",
        "/api/media/upload",
        "/api/media/:shipId",
        "/api/media/:shipId/:filename",
        "/api/ncrs",
        "/api/ncrs/ships/:shipId",
        "/api/ncrs/:id",
        "/api/ncrs/:id/remark",
        "/api/ncrs/:id/approve",
        "/api/ncrs/:id (DELETE)",
        "/api/ncrs/:id/files",
        "/api/ncrs/:id/files/:fileId",
        "/api/ncrs/:id/pdf",
        "/api/dev/inspection-item-submission",
        "/api/dev/inspection-item-submission/examples",
        "/api/dev/resolve-item-state",
        "/api/dev/resolve-item-state/examples"
      ]
    });
  });

  // P0: 生产环境禁用调试路由
  app.route("/api/dev", (() => {
    const dev = new Hono<{ Bindings: Bindings }>();
    dev.all("*", (c) => {
      if (c.env.APP_ENV === "production") {
        return c.json({ ok: false, error: "Not available in production" }, 404);
      }
      // 非生产环境正常转发
      return devRoutes.fetch(c.req.raw, c.env);
    });
    return dev;
  })());

  app.route("/api/auth", createAuthRoutes());
  app.route("/api/inspections", createInspectionRoutes(resolveStorage));
  app.route("/api/observation-types", createObservationTypeRoutes());
  app.route("/api/projects", createProjectRoutes());
  app.route("/api/ships", createShipRoutes());
  app.route("/api/users", createUserRoutes());
  app.route("/api", createObservationRoutes());
  app.route("/api/media", createMediaRoutes());
  app.route("/api/ncrs", createNcrRoutes());
  app.route("/api/ncrs", createNcrFileRoutes());
  app.route("/api/ncrs", createNcrPdfRoutes());
  app.route("/api/sql", createSqlConsoleRoutes());


  return app;
}

const app = createApp();

export { createApp };
export default app;
