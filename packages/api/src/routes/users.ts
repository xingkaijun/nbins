import { Hono } from "hono";
import type { Bindings } from "../env.ts";

// 生成简单 UUID
function generateId(): string {
  return crypto.randomUUID();
}

// 简易密码哈希（演示用，生产环境应使用 bcrypt / argon2）
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createUserRoutes(): Hono<{ Bindings: Bindings }> {
  const routes = new Hono<{ Bindings: Bindings }>();

  // 查询用户列表（支持 role / isActive 筛选）
  routes.get("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const role = c.req.query("role");
      const isActive = c.req.query("isActive");

      let sql = `SELECT "id", "username", "displayName", "role", "disciplines", "isActive", "createdAt", "updatedAt"
                 FROM "users"`;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (role) {
        conditions.push(`"role" = ?`);
        params.push(role);
      }
      if (isActive !== undefined && isActive !== "") {
        conditions.push(`"isActive" = ?`);
        params.push(isActive === "true" ? 1 : 0);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }

      sql += ` ORDER BY "createdAt" DESC`;

      const result = await db.prepare(sql).bind(...params).all();
      return c.json({ ok: true, data: result.results ?? [] });
    } catch (e: any) {
      console.error("GET /users error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 获取单个用户详情（不含密码哈希）
  routes.get("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const user = await db
        .prepare(
          `SELECT "id", "username", "displayName", "role", "disciplines", "isActive", "createdAt", "updatedAt"
           FROM "users" WHERE "id" = ?`
        )
        .bind(id)
        .first();

      if (!user) {
        return c.json({ ok: false, error: "用户不存在" }, 404);
      }

      return c.json({ ok: true, data: user });
    } catch (e: any) {
      console.error("GET /users/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 新增用户
  routes.post("/", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const body = await c.req.json<{
        username: string;
        displayName: string;
        password: string;
        role: string;
        disciplines?: string[];
      }>();

      if (!body.username || !body.displayName || !body.password || !body.role) {
        return c.json({ ok: false, error: "username, displayName, password, role 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const id = generateId();
      const passwordHash = await hashPassword(body.password);

      await db
        .prepare(
          `INSERT INTO "users"
           ("id", "username", "displayName", "passwordHash", "role", "disciplines", "isActive", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .bind(
          id,
          body.username,
          body.displayName,
          passwordHash,
          body.role,
          JSON.stringify(body.disciplines ?? []),
          now,
          now
        )
        .run();

      return c.json({
        ok: true,
        data: {
          id,
          username: body.username,
          displayName: body.displayName,
          role: body.role,
          disciplines: body.disciplines ?? [],
          isActive: 1,
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (e: any) {
      console.error("POST /users error:", e);
      if (String(e).includes("UNIQUE")) {
        return c.json({ ok: false, error: `用户名 '${(await c.req.json()).username}' 已存在` }, 409);
      }
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 编辑用户（不含密码修改）
  routes.put("/:id", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{
        displayName?: string;
        role?: string;
        disciplines?: string[];
        isActive?: boolean;
      }>();

      const now = new Date().toISOString();
      const sets: string[] = [`"updatedAt" = ?`];
      const params: unknown[] = [now];

      if (body.displayName !== undefined) { sets.push(`"displayName" = ?`); params.push(body.displayName); }
      if (body.role !== undefined) { sets.push(`"role" = ?`); params.push(body.role); }
      if (body.disciplines !== undefined) { sets.push(`"disciplines" = ?`); params.push(JSON.stringify(body.disciplines)); }
      if (body.isActive !== undefined) { sets.push(`"isActive" = ?`); params.push(body.isActive ? 1 : 0); }

      params.push(id);

      const info = await db
        .prepare(`UPDATE "users" SET ${sets.join(", ")} WHERE "id" = ?`)
        .bind(...params)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "用户不存在" }, 404);
      }

      return c.json({ ok: true, data: { id, updatedAt: now } });
    } catch (e: any) {
      console.error("PUT /users/:id error:", e);
      return c.json({ ok: false, error: String(e) }, 500);
    }
  });

  // 修改密码（独立端点）
  routes.put("/:id/password", async (c) => {
    try {
      const db = c.env.DB;
      if (!db) {
        return c.json({ ok: false, error: "数据库未配置" }, 500);
      }

      const id = c.req.param("id");
      const body = await c.req.json<{ password: string }>();

      if (!body.password) {
        return c.json({ ok: false, error: "password 为必填项" }, 400);
      }

      const now = new Date().toISOString();
      const passwordHash = await hashPassword(body.password);

      const info = await db
        .prepare(`UPDATE "users" SET "passwordHash" = ?, "updatedAt" = ? WHERE "id" = ?`)
        .bind(passwordHash, now, id)
        .run();

      if (info.meta?.changes === 0) {
        return c.json({ ok: false, error: "用户不存在" }, 404);
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
