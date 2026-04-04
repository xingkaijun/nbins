import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { ObservationTypeRecord } from "../persistence/records.ts";
import { isD1Enabled, mockObservationTypes } from "./route-helpers.ts";

function generateId(): string {
  return crypto.randomUUID();
}

function createObservationTypeRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (c) => {
    try {
      if (isD1Enabled(c.env)) {
        const result = await c.env.DB!
          .prepare('SELECT * FROM "observation_types" ORDER BY "sortOrder" ASC, "code" ASC')
          .all();

        return c.json({
          ok: true,
          data: result.results ?? []
        });
      }

      return c.json({
        ok: true,
        data: [...mockObservationTypes].sort(
          (left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code)
        )
      });
    } catch (e: any) {
      console.error("GET /observation-types error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{ code: string; label: string; sortOrder?: number }>();

    if (!body.code || !body.label) {
      return c.json({ ok: false, error: "code 和 label 为必填项" }, 400);
    }

    const now = new Date().toISOString();
    const record: ObservationTypeRecord = {
      id: generateId(),
      code: body.code,
      label: body.label,
      sortOrder: body.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now
    };

    try {
      if (isD1Enabled(c.env)) {
        await c.env.DB!
          .prepare(
            `INSERT INTO "observation_types" ("id", "code", "label", "sortOrder", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(record.id, record.code, record.label, record.sortOrder, record.createdAt, record.updatedAt)
          .run();
      } else {
        if (mockObservationTypes.some((item) => item.code === record.code)) {
          return c.json({ ok: false, error: `类型编码 '${record.code}' 已存在` }, 409);
        }

        mockObservationTypes.push(record);
      }

      return c.json({ ok: true, data: record });
    } catch (e: any) {
      console.error("POST /observation-types error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `类型编码 '${record.code}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

const observationTypeRoutes = createObservationTypeRoutes();

export { createObservationTypeRoutes, observationTypeRoutes };
