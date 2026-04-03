import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { InspectionRepository } from "../repositories/inspection-repository.ts";
import { InspectionService } from "../services/inspection-service.ts";

function createInspectionRoutes(): Hono<{ Bindings: Bindings }> {
  const inspectionRoutes = new Hono<{ Bindings: Bindings }>();
  const resolveStorage = createInspectionStorageResolver();

  inspectionRoutes.get("/:id", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    const detail = await inspectionService.readInspectionItemDetail(c.req.param("id"));

    if (!detail) {
      return c.json(
        {
          ok: false,
          error: "Inspection item not found"
        },
        404
      );
    }

    return c.json({
      ok: true,
      data: detail
    });
  });

  inspectionRoutes.put("/:id/rounds/current/result", async (c) => {
    const inspectionService = new InspectionService(
      new InspectionRepository(resolveStorage(c.env))
    );
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json(
        {
          ok: false,
          error: "Request body must be valid JSON"
        },
        400
      );
    }

    if (!body || typeof body !== "object") {
      return c.json(
        {
          ok: false,
          error: "Request body must be an object"
        },
        400
      );
    }

    try {
      const response = await inspectionService.submitInspectionResult(
        c.req.param("id"),
        body as never
      );

      return c.json({
        ok: true,
        data: response
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "INSPECTION_ITEM_NOT_FOUND") {
        return c.json({ ok: false, error: "Inspection item not found" }, 404);
      }

      if (message === "INSPECTION_ITEM_VERSION_CONFLICT") {
        return c.json(
          {
            ok: false,
            error: "Inspection item version conflict"
          },
          409
        );
      }

      return c.json(
        {
          ok: false,
          error: message
        },
        400
      );
    }
  });

  return inspectionRoutes;
}

const inspectionRoutes = createInspectionRoutes();

export { createInspectionRoutes, inspectionRoutes };
