import type { MiddlewareHandler } from "hono";
import type { Discipline, Role } from "@nbins/shared";

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disciplines: Discipline[];
}

export interface AuthContextVariables {
  authUser: AuthenticatedUser;
}

export interface VerifyAccessTokenResult extends AuthenticatedUser {
  isActive: boolean;
}

export interface RequireAuthOptions {
  verifyAccessToken: (token: string) => Promise<VerifyAccessTokenResult | null>;
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
    Variables: AuthContextVariables;
  }
>(options: RequireAuthOptions): MiddlewareHandler<E> {
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

    const verifiedUser = await options.verifyAccessToken(token);

    if (!verifiedUser) {
      return c.json(
        {
          ok: false,
          error: "Invalid access token"
        },
        401
      );
    }

    if (!verifiedUser.isActive) {
      return c.json(
        {
          ok: false,
          error: "User account is inactive"
        },
        403
      );
    }

    const { isActive: _isActive, ...authUser } = verifiedUser;
    c.set("authUser", authUser);
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
