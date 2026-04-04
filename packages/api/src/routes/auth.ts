import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { UserRepository } from "../repositories/user-repository.ts";
import { AuthService } from "../services/auth-service.ts";

function createAuthRoutes(): Hono<{ Bindings: Bindings }> {
  const authRoutes = new Hono<{ Bindings: Bindings }>();
  const resolveStorage = createInspectionStorageResolver();

  authRoutes.post("/login", async (c) => {
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json({ ok: false, error: "Request body must be valid JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "Request body must be an object" }, 400);
    }

    const { username, password } = body as Record<string, unknown>;

    if (typeof username !== "string" || username.trim().length === 0) {
      return c.json({ ok: false, error: "username is required" }, 400);
    }

    if (typeof password !== "string" || password.length === 0) {
      return c.json({ ok: false, error: "password is required" }, 400);
    }

    const authService = new AuthService(new UserRepository(resolveStorage(c.env)));

    try {
      const result = await authService.login({
        username: username.trim().toLowerCase(),
        password
      });

      return c.json({
        ok: true,
        data: result
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_INVALID_CREDENTIALS") {
        return c.json({ ok: false, error: "Invalid username or password" }, 401);
      }

      throw error;
    }
  });

  return authRoutes;
}

const authRoutes = createAuthRoutes();

export { authRoutes, createAuthRoutes };
