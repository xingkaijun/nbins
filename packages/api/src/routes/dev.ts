import { Hono } from "hono";
import { applyInspectionResultSubmission, APPLY_SUBMISSION_EXAMPLES } from "../domain/inspection-item-submission.ts";
import {
  RESOLVE_ITEM_STATE_EXAMPLES,
  resolveInspectionItemState
} from "../domain/inspection-item-state.ts";

const devRoutes = new Hono();

devRoutes.get("/inspection-item-submission/examples", (c) => {
  return c.json({
    examples: APPLY_SUBMISSION_EXAMPLES
  });
});

devRoutes.post("/inspection-item-submission", async (c) => {
  const body = await c.req.json<{
    item?: unknown;
    submission?: unknown;
  }>();

  if (!body || typeof body !== "object") {
    return c.json(
      {
        ok: false,
        error: "Request body must be an object with item and submission"
      },
      400
    );
  }

  if (!("item" in body) || !body.item || typeof body.item !== "object") {
    return c.json(
      {
        ok: false,
        error: "item snapshot is required"
      },
      400
    );
  }

  if (
    !("submission" in body) ||
    !body.submission ||
    typeof body.submission !== "object"
  ) {
    return c.json(
      {
        ok: false,
        error: "submission payload is required"
      },
      400
    );
  }

  try {
    const output = applyInspectionResultSubmission({
      item: body.item as never,
      submission: body.submission as never
    });

    return c.json({
      ok: true,
      route: "/api/dev/inspection-item-submission",
      output
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      400
    );
  }
});

devRoutes.get("/resolve-item-state/examples", (c) => {
  return c.json({
    examples: RESOLVE_ITEM_STATE_EXAMPLES
  });
});

devRoutes.post("/resolve-item-state", async (c) => {
  const body = await c.req.json<{
    latestSubmittedResult?: unknown;
    openCommentCount?: unknown;
  }>();

  if (
    !("openCommentCount" in body) ||
    typeof body.openCommentCount !== "number" ||
    !Number.isInteger(body.openCommentCount) ||
    body.openCommentCount < 0
  ) {
    return c.json(
      {
        ok: false,
        error: "openCommentCount must be a non-negative integer"
      },
      400
    );
  }

  if (
    body.latestSubmittedResult !== null &&
    body.latestSubmittedResult !== undefined &&
    typeof body.latestSubmittedResult !== "string"
  ) {
    return c.json(
      {
        ok: false,
        error: "latestSubmittedResult must be a string result code or null"
      },
      400
    );
  }

  try {
    const state = resolveInspectionItemState({
      latestSubmittedResult:
        body.latestSubmittedResult === undefined
          ? null
          : (body.latestSubmittedResult as
              | "AA"
              | "CX"
              | "OWC"
              | "QCC"
              | "RJ"
              | null),
      openCommentCount: body.openCommentCount,
      totalCommentCount: (body as any).totalCommentCount ?? body.openCommentCount
    });

    return c.json({
      ok: true,
      input: {
        latestSubmittedResult: body.latestSubmittedResult ?? null,
        openCommentCount: body.openCommentCount,
        totalCommentCount: (body as any).totalCommentCount ?? body.openCommentCount
      },
      state
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      400
    );
  }
});

export { devRoutes };
