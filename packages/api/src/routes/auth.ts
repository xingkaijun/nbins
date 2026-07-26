import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import { createRequireAuth } from "../auth.ts";
import type { AuthContextVariables } from "../auth.ts";
import { issueAccessToken } from "../auth/jwt.ts";
import { createPasswordHash } from "../auth/password.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { UserRepository } from "../repositories/user-repository.ts";
import { AuthService } from "../services/auth-service.ts";

type AuthRouteEnv = {
  Bindings: Bindings;
  Variables: AuthContextVariables;
};

function createAuthRoutes(): Hono<AuthRouteEnv> {
  const authRoutes = new Hono<AuthRouteEnv>();
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
      const token = await issueAccessToken(
        {
          id: result.user.id,
          role: result.user.role,
          disciplines: result.user.disciplines,
          username: result.user.username,
          displayName: result.user.displayName
        },
        c.env
      );

      return c.json({
        ok: true,
        data: {
          ...result,
          token
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_INVALID_CREDENTIALS") {
        return c.json({ ok: false, error: "Invalid username or password" }, 401);
      }

      if (error instanceof Error && error.message === "JWT_SECRET is required when APP_ENV=production") {
        return c.json({ ok: false, error: error.message }, 500);
      }

      throw error;
    }
  });

  // 公开端点：通过旧密码验证身份后修改密码（无需 JWT）
  authRoutes.post("/change-password", async (c) => {
    let body: unknown;

    try {
      body = await c.req.json<unknown>();
    } catch {
      return c.json({ ok: false, error: "Request body must be valid JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return c.json({ ok: false, error: "Request body must be an object" }, 400);
    }

    const { username, oldPassword, newPassword } = body as Record<string, unknown>;

    if (typeof username !== "string" || username.trim().length === 0) {
      return c.json({ ok: false, error: "username is required" }, 400);
    }

    if (typeof oldPassword !== "string" || oldPassword.length === 0) {
      return c.json({ ok: false, error: "oldPassword is required" }, 400);
    }

    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return c.json({ ok: false, error: "newPassword must be at least 4 characters" }, 400);
    }

    const authService = new AuthService(new UserRepository(resolveStorage(c.env)));

    try {
      // 先用旧密码验证身份
      const result = await authService.login({
        username: username.trim().toLowerCase(),
        password: oldPassword
      });

      // 验证通过，更新密码
      const now = new Date().toISOString();
      const passwordHash = await createPasswordHash(newPassword);

      await c.env.DB!
        .prepare('UPDATE "users" SET "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?')
        .bind(passwordHash, now, result.user.id)
        .run();

      return c.json({ ok: true, data: { message: "Password changed successfully" } });
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_INVALID_CREDENTIALS") {
        return c.json({ ok: false, error: "Invalid username or current password" }, 401);
      }

      throw error;
    }
  });

  authRoutes.get("/me", createRequireAuth(), async (c) => {
    const authService = new AuthService(new UserRepository(resolveStorage(c.env)));

    try {
      const user = await authService.getUserProfile(c.get("authUser").id);

      return c.json({
        ok: true,
        data: {
          user
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
        return c.json({ ok: false, error: "Authenticated user not found" }, 401);
      }

      throw error;
    }
  });

  return authRoutes;
}

const authRoutes = createAuthRoutes();

export { authRoutes, createAuthRoutes };
