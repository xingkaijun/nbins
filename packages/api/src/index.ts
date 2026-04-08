import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMockDashboardSnapshot } from "@nbins/shared";
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
import { createNcrRoutes } from "./routes/ncrs.ts";
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
        "http://127.0.0.1:4173",
        "http://localhost:4173",
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
    const snapshot = createMockDashboardSnapshot();

    return c.json({
      appName: c.env.APP_NAME ?? "NBINS",
      environment: c.env.APP_ENV ?? "development",
      storageMode: c.env.D1_DRIVER === "d1" && c.env.DB ? "d1" : "mock",
      generatedAt: snapshot.generatedAt,
      disciplines: [...new Set(snapshot.items.map((item) => item.discipline))],
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
        "/api/projects",
        "/api/projects/:id",
        "/api/ships",
        "/api/ships/:id",
        "/api/users",
        "/api/users/:id",
        "/api/users/:id/password",
        "/api/dev/inspection-item-submission",
        "/api/dev/inspection-item-submission/examples",
        "/api/dev/resolve-item-state",
        "/api/dev/resolve-item-state/examples"
      ]
    });
  });

  app.route("/api/dev", devRoutes);
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/inspections", createInspectionRoutes(resolveStorage));
  app.route("/api/observation-types", createObservationTypeRoutes());
  app.route("/api/projects", createProjectRoutes(resolveStorage));
  app.route("/api/ships", createShipRoutes(resolveStorage));
  app.route("/api/users", createUserRoutes(resolveStorage));
  app.route("/api", createObservationRoutes(resolveStorage));
  app.route("/api/ncrs", createNcrRoutes(resolveStorage));

  return app;
}

const app = createApp();

export { createApp };
export default app;
