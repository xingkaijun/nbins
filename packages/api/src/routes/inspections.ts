import { Hono } from "hono";
import { createMockInspectionDatabase } from "../persistence/mock-inspection-db.ts";
import { InspectionRepository } from "../repositories/inspection-repository.ts";
import { InspectionService } from "../services/inspection-service.ts";

function createInspectionRoutes(): Hono {
  const inspectionRoutes = new Hono();
  const inspectionService = new InspectionService(
    new InspectionRepository(createMockInspectionDatabase())
  );

  inspectionRoutes.get("/:id", (c) => {
    const detail = inspectionService.readInspectionItemDetail(c.req.param("id"));

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
      const response = inspectionService.submitInspectionResult(
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
