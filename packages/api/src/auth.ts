import type { MiddlewareHandler } from "hono";
import type { Discipline, Role } from "@nbins/shared";
import type { Bindings } from "./env.ts";
import { verifyAccessToken as verifyJwtAccessToken } from "./auth/jwt.ts";
import { createInspectionStorageResolver } from "./persistence/storage-factory.ts";
import { UserRepository } from "./repositories/user-repository.ts";
import { AuthService } from "./services/auth-service.ts";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  disciplines: Discipline[];
}

export interface AuthContextVariables {
  user: AuthenticatedUser;
  authUser: AuthenticatedUser;
}

const resolveStorage = createInspectionStorageResolver();

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, ...tokenParts] = headerValue.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || tokenParts.length !== 1 || tokenParts[0].length === 0) {
    return null;
  }

  return tokenParts[0];
}

export function createRequireAuth<
  E extends {
    Bindings: Bindings;
    Variables: AuthContextVariables;
  }
>(): MiddlewareHandler<E> {
  return async (c, next) => {
    const token = extractBearerToken(c.req.header("authorization"));

    if (!token) {
      return c.json(
        {
          ok: false,
          error: "Authorization header must use Bearer token"
        },
        401
      );
    }

    const verifiedUser = await verifyJwtAccessToken(token, c.env);

    if (!verifiedUser) {
      return c.json(
        {
          ok: false,
          error: "Invalid access token"
        },
        401
      );
    }

    const authService = new AuthService(new UserRepository(resolveStorage(c.env)));

    try {
      const currentUser = await authService.getUserProfile(verifiedUser.id);
      const authUser: AuthenticatedUser = {
        id: currentUser.id,
        role: currentUser.role,
        disciplines: [...currentUser.disciplines]
      };

      c.set("user", authUser);
      c.set("authUser", authUser);
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
        return c.json(
          {
            ok: false,
            error: "Invalid access token"
          },
          401
        );
      }

      throw error;
    }

    await next();
  };
}

export function createRequireRole<
  E extends {
    Variables: AuthContextVariables;
  }
>(roles: Role[]): MiddlewareHandler<E> {
  return async (c, next) => {
    const authUser = c.get("authUser");

    if (!roles.includes(authUser.role)) {
      return c.json(
        {
          ok: false,
          error: "Forbidden"
        },
        403
      );
    }

    await next();
  };
}
