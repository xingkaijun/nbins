import type { MiddlewareHandler } from "hono";
import type { Discipline, Role } from "@nbins/shared";
import type { Bindings } from "./env.ts";
import { verifyAccessToken as verifyJwtAccessToken } from "./auth/jwt.ts";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  disciplines: Discipline[];
}

export interface AuthContextVariables {
  user: AuthenticatedUser;
  authUser: AuthenticatedUser;
}

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

    c.set("user", verifiedUser);
    c.set("authUser", verifiedUser);
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
