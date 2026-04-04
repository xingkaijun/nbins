import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMockDashboardSnapshot } from "@nbins/shared";
import type { Bindings } from "./env.ts";
import { createAuthRoutes } from "./routes/auth.ts";
import { devRoutes } from "./routes/dev.ts";
import { createInspectionRoutes } from "./routes/inspections.ts";

function createApp(): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();

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
      generatedAt: snapshot.generatedAt,
      disciplines: [...new Set(snapshot.items.map((item) => item.discipline))],
      routes: [
        "/health",
        "/api/meta",
        "/api/auth/login",
        "/api/inspections",
        "/api/inspections/:id",
        "/api/inspections/:id/rounds/current/result",
        "/api/dev/inspection-item-submission",
        "/api/dev/inspection-item-submission/examples",
        "/api/dev/resolve-item-state",
        "/api/dev/resolve-item-state/examples"
      ]
    });
  });

  app.route("/api/dev", devRoutes);
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/inspections", createInspectionRoutes());

  return app;
}

const app = createApp();

export { createApp };
export default app;