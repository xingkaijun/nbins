import { Hono } from "hono";
import { createMockDashboardSnapshot } from "@nbins/shared";
import type { Bindings } from "./env.ts";
import { devRoutes } from "./routes/dev.ts";
import { inspectionRoutes } from "./routes/inspections.ts";

const app = new Hono<{ Bindings: Bindings }>();

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
app.route("/api/inspections", inspectionRoutes);

export default app;
