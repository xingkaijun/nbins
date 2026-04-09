import { Hono } from "hono";
import type { Bindings } from "../env.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { UserRecord } from "../persistence/records.ts";
import { createInspectionStorageResolver } from "../persistence/storage-factory.ts";
import { isD1Enabled, mapUserRecord } from "./route-helpers.ts";

function generateId(): string {
  return crypto.randomUUID();
}

import { createPasswordHash } from "../auth/password.ts";

async function hashPassword(password: string): Promise<string> {
  return createPasswordHash(password);
}

function createUserRoutes(
  resolveStorage: (bindings?: Bindings) => InspectionStorage = createInspectionStorageResolver()
): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (c) => {
    try {
      const role = c.req.query("role");
      const isActive = c.req.query("isActive");

      if (isD1Enabled(c.env)) {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (role) {
          conditions.push('"role" = ?');
          params.push(role);
        }
        if (isActive !== undefined && isActive !== "") {
          conditions.push('"isActive" = ?');
          params.push(isActive === "true" ? 1 : 0);
        }

        const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
        const result = await c.env.DB!
          .prepare(
            `SELECT "id", "username", "displayName", "role", "disciplines", "accessibleProjectIds", "isActive", "createdAt", "updatedAt"
             FROM "users"${where} ORDER BY "createdAt" DESC`
          )
          .bind(...params)
          .all<Record<string, unknown>>();

        return c.json({
          ok: true,
          data: (result.results ?? []).map(mapUserRecord).map(({ passwordHash, ...user }) => user)
        });
      }

      const snapshot = await resolveStorage(c.env).read();
      const users = snapshot.users
        .filter(
          (user) =>
            (!role || user.role === role) &&
            (isActive === undefined || isActive === "" || user.isActive === (isActive === "true" ? 1 : 0))
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(({ passwordHash, ...user }) => user);

      return c.json({ ok: true, data: users });
    } catch (e: any) {
      console.error("GET /users error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");

      if (isD1Enabled(c.env)) {
        const userRow = await c.env.DB!
          .prepare(
            `SELECT "id", "username", "displayName", "role", "disciplines", "accessibleProjectIds", "isActive", "createdAt", "updatedAt"
             FROM "users" WHERE "id" = ?`
          )
          .bind(id)
          .first<Record<string, unknown>>();

        if (!userRow) {
          return c.json({ ok: false, error: "用户不存在" }, 404);
        }

        const { passwordHash, ...user } = mapUserRecord(userRow);
        return c.json({ ok: true, data: user });
      }

      const snapshot = await resolveStorage(c.env).read();
      const user = snapshot.users.find((record) => record.id === id);

      if (!user) {
        return c.json({ ok: false, error: "用户不存在" }, 404);
      }

      const { passwordHash, ...safeUser } = user;
      return c.json({ ok: true, data: safeUser });
    } catch (e: any) {
      console.error("GET /users/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{
      username: string;
      displayName: string;
      password: string;
      role: string;
      disciplines?: string[];
      accessibleProjectIds?: string[];
    }>();

    if (!body.username || !body.displayName || !body.password || !body.role) {
      return c.json({ ok: false, error: "username, displayName, password, role 为必填项" }, 400);
    }

    const now = new Date().toISOString();
    const record: UserRecord = {
      id: generateId(),
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
      role: body.role as UserRecord["role"],
      disciplines: (body.disciplines ?? []) as UserRecord["disciplines"],
      accessibleProjectIds: body.accessibleProjectIds ?? [],
      isActive: 1,
      createdAt: now,
      updatedAt: now
    };

    try {
      if (isD1Enabled(c.env)) {
        await c.env.DB!
          .prepare(
            `INSERT INTO "users"
             ("id", "username", "displayName", "passwordHash", "role", "disciplines", "accessibleProjectIds", "isActive", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(
            record.id,
            record.username,
            record.displayName,
            record.passwordHash,
            record.role,
            JSON.stringify(record.disciplines),
            JSON.stringify(record.accessibleProjectIds),
            record.createdAt,
            record.updatedAt
          )
          .run();
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();

        if (snapshot.users.some((user) => user.username === record.username)) {
          return c.json({ ok: false, error: `用户名 '${record.username}' 已存在` }, 409);
        }

        snapshot.users.push(record);
        await storage.write(snapshot);
      }

      const { passwordHash, ...safeUser } = record;
      return c.json({ ok: true, data: safeUser });
    } catch (e: any) {
      console.error("POST /users error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `用户名 '${record.username}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{
        displayName?: string;
        role?: string;
        disciplines?: string[];
        accessibleProjectIds?: string[];
        isActive?: boolean;
      }>();
      const now = new Date().toISOString();

      if (isD1Enabled(c.env)) {
        const sets: string[] = ['"updatedAt" = ?'];
        const params: unknown[] = [now];

        if (body.displayName !== undefined) sets.push('"displayName" = ?'), params.push(body.displayName);
        if (body.role !== undefined) sets.push('"role" = ?'), params.push(body.role);
        if (body.disciplines !== undefined) {
          sets.push('"disciplines" = ?');
          params.push(JSON.stringify(body.disciplines));
        }
        if (body.accessibleProjectIds !== undefined) {
          sets.push('"accessibleProjectIds" = ?');
          params.push(JSON.stringify(body.accessibleProjectIds));
        }
        if (body.isActive !== undefined) sets.push('"isActive" = ?'), params.push(body.isActive ? 1 : 0);

        params.push(id);

        const info = await c.env.DB!
          .prepare(`UPDATE "users" SET ${sets.join(", ")} WHERE "id" = ?`)
          .bind(...params)
          .run();

        if (info.meta?.changes === 0) {
          return c.json({ ok: false, error: "用户不存在" }, 404);
        }
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();
        const user = snapshot.users.find((record) => record.id === id);

        if (!user) {
          return c.json({ ok: false, error: "用户不存在" }, 404);
        }

        if (body.displayName !== undefined) user.displayName = body.displayName;
        if (body.role !== undefined) user.role = body.role as UserRecord["role"];
        if (body.disciplines !== undefined) {
          user.disciplines = body.disciplines as UserRecord["disciplines"];
        }
        if (body.accessibleProjectIds !== undefined) {
          user.accessibleProjectIds = body.accessibleProjectIds;
        }
        if (body.isActive !== undefined) user.isActive = body.isActive ? 1 : 0;
        user.updatedAt = now;

        await storage.write(snapshot);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /users/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  routes.put("/:id/password", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json<{ password: string }>();

      if (!body.password) {
        return c.json({ ok: false, error: "password 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const passwordHash = await hashPassword(body.password);

      if (isD1Enabled(c.env)) {
        const info = await c.env.DB!
          .prepare('UPDATE "users" SET "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?')
          .bind(passwordHash, now, id)
          .run();

        if (info.meta?.changes === 0) {
          return c.json({ ok: false, error: "用户不存在" }, 404);
        }
      } else {
        const storage = resolveStorage(c.env);
        const snapshot = await storage.read();
        const user = snapshot.users.find((record) => record.id === id);

        if (!user) {
          return c.json({ ok: false, error: "用户不存在" }, 404);
        }

        user.passwordHash = passwordHash;
        user.updatedAt = now;
        await storage.write(snapshot);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /users/:id/password error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  return routes;
}

export { createUserRoutes };
