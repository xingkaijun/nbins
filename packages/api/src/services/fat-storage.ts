import type { D1Database } from "@cloudflare/workers-types";
import type { FatIndexRecord } from "../persistence/records.ts";
import type { Bindings } from "../env.ts";
import type { AuthenticatedUser } from "../auth.ts";
import type { FatItemResponse } from "@nbins/shared";
import { resolveAllowedProjectIds } from "../routes/route-helpers.ts";

export interface StoredFatRecord {
  id: string;
  projectId: string;
  shipId: string;
  title: string;
  discipline: string;
  serialNo: number;
  content: string;
  result: string | null;
  remark: string | null;
  maker: string | null;
  authorId: string;
  imageAttachments: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserDisplayRow {
  id: string;
  displayName: string;
  title: string | null;
}

interface ShipDisplayRow {
  id: string;
  shipName: string;
  hullNumber: string;
}

interface QueryFatIndexFilters {
  projectId?: string;
  shipId?: string;
  keyword?: string;
}

function assertDb(env: Bindings): NonNullable<Bindings["DB"]> {
  if (!env.DB) {
    throw new Error("D1 database binding not configured");
  }
  return env.DB;
}

export function assertBucket(env: Bindings): NonNullable<Bindings["BUCKET"]> {
  if (!env.BUCKET) {
    throw new Error("R2 bucket binding not configured");
  }
  return env.BUCKET;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  } catch {
    return [];
  }
}

export function getFatObjectKey(shipId: string, fatId: string): string {
  return `fats/${shipId}/${fatId}.json`;
}

export async function getShipContextByShipId(db: D1Database, shipId: string): Promise<{ id: string; projectId: string; shipName: string; hullNumber: string } | null> {
  const row = await db
    .prepare('SELECT "id", "projectId", "shipName", "hullNumber" FROM "ships" WHERE "id" = ?')
    .bind(shipId)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    projectId: String(row.projectId),
    shipName: String(row.shipName),
    hullNumber: String(row.hullNumber)
  };
}

export async function hasProjectAccess(
  db: D1Database,
  user: AuthenticatedUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") {
    return true;
  }
  const allowedProjectIds = await resolveAllowedProjectIds(db, user.id);
  return allowedProjectIds.includes(projectId);
}

export function normalizeStoredFatRecord(raw: Record<string, unknown>): StoredFatRecord {
  const imageAttachments = parseStringArray(raw.imageAttachments);
  return {
    id: String(raw.id),
    projectId: String(raw.projectId),
    shipId: String(raw.shipId),
    title: String(raw.title),
    discipline: typeof raw.discipline === "string" ? raw.discipline : "GENERAL",
    serialNo: typeof raw.serialNo === "number" ? raw.serialNo : Number(raw.serialNo ?? 0),
    content: String(raw.content),
    result: typeof raw.result === "string" ? raw.result : null,
    remark: typeof raw.remark === "string" ? raw.remark : null,
    maker: typeof raw.maker === "string" ? raw.maker : null,
    authorId: String(raw.authorId),
    imageAttachments,
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt)
  };
}

export async function writeStoredFat(env: Bindings, record: StoredFatRecord): Promise<void> {
  const bucket = assertBucket(env);
  await bucket.put(getFatObjectKey(record.shipId, record.id), JSON.stringify(record, null, 2), {
    httpMetadata: {
      contentType: "application/json"
    }
  });
}

export async function readStoredFatByIndex(env: Bindings, indexRow: Pick<FatIndexRecord, "id" | "shipId">): Promise<StoredFatRecord | null> {
  const bucket = assertBucket(env);
  const object = await bucket.get(getFatObjectKey(indexRow.shipId, indexRow.id));
  if (!object) {
    return null;
  }

  const text = await object.text();
  try {
    return normalizeStoredFatRecord(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getFatIndexById(env: Bindings, id: string): Promise<FatIndexRecord | null> {
  const db = assertDb(env);
  const row = await db
    .prepare('SELECT * FROM "fat_index" WHERE "id" = ?')
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return mapFatIndexRecord(row);
}

export async function readStoredFatById(env: Bindings, id: string): Promise<StoredFatRecord | null> {
  const indexRow = await getFatIndexById(env, id);
  if (!indexRow) {
    return null;
  }
  return readStoredFatByIndex(env, indexRow);
}

export function mapFatIndexRecord(row: Record<string, unknown>): FatIndexRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    shipId: String(row.shipId),
    title: String(row.title),
    discipline: String(row.discipline),
    serialNo: typeof row.serialNo === "number" ? row.serialNo : Number(row.serialNo ?? 0),
    result: typeof row.result === "string" ? row.result : null,
    remark: typeof row.remark === "string" ? row.remark : null,
    maker: typeof row.maker === "string" ? row.maker : null,
    authorId: String(row.authorId),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export async function upsertFatIndex(env: Bindings, record: StoredFatRecord): Promise<void> {
  const db = assertDb(env);
  await db.prepare(
    `INSERT INTO "fat_index" (
      "id", "projectId", "shipId", "title", "discipline", "serialNo", "result", "remark", "maker", "authorId", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT("id") DO UPDATE SET
      "projectId" = excluded."projectId",
      "shipId" = excluded."shipId",
      "title" = excluded."title",
      "discipline" = excluded."discipline",
      "serialNo" = excluded."serialNo",
      "result" = excluded."result",
      "remark" = excluded."remark",
      "maker" = excluded."maker",
      "authorId" = excluded."authorId",
      "createdAt" = excluded."createdAt",
      "updatedAt" = excluded."updatedAt"`
  ).bind(
    record.id,
    record.projectId,
    record.shipId,
    record.title,
    record.discipline,
    record.serialNo,
    record.result,
    record.remark,
    record.maker,
    record.authorId,
    record.createdAt,
    record.updatedAt
  ).run();
}

export async function getNextFatSerialNo(env: Bindings, shipId: string): Promise<number> {
  const db = assertDb(env);
  const result = await db
    .prepare('SELECT MAX("serialNo") as maxSerial FROM "fat_index" WHERE "shipId" = ?')
    .bind(shipId)
    .first<{ maxSerial: number | null }>();
  return (result?.maxSerial ?? 0) + 1;
}

export async function queryFatIndex(
  env: Bindings,
  user: AuthenticatedUser,
  filters: QueryFatIndexFilters
): Promise<FatIndexRecord[]> {
  const db = assertDb(env);
  const isAdmin = user.role === "admin";
  const allowedProjectIds = isAdmin ? [] : await resolveAllowedProjectIds(db, user.id);

  if (!isAdmin && allowedProjectIds.length === 0) {
    return [];
  }

  if (!isAdmin && filters.projectId && !allowedProjectIds.includes(filters.projectId)) {
    return [];
  }

  let sql = 'SELECT * FROM "fat_index" WHERE 1 = 1';
  const params: unknown[] = [];

  if (!isAdmin) {
    sql += ` AND "projectId" IN (${allowedProjectIds.map(() => "?").join(", ")})`;
    params.push(...allowedProjectIds);
  }

  if (filters.projectId) {
    sql += ' AND "projectId" = ?';
    params.push(filters.projectId);
  }

  if (filters.shipId) {
    sql += ' AND "shipId" = ?';
    params.push(filters.shipId);
  }

  if (filters.keyword && filters.keyword.trim().length > 0) {
    sql += ` AND (LOWER("title") LIKE ? ESCAPE '\\' OR LOWER(COALESCE("remark", '')) LIKE ? ESCAPE '\\')`;
    const escaped = filters.keyword.trim().toLowerCase().replace(/[%_\\]/g, "\\$&");
    const normalized = `%${escaped}%`;
    params.push(normalized, normalized);
  }

  sql += ' ORDER BY "updatedAt" DESC, "createdAt" DESC';

  const result = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapFatIndexRecord);
}

export async function hydrateFatResponses(env: Bindings, records: StoredFatRecord[]): Promise<FatItemResponse[]> {
  const db = assertDb(env);
  if (records.length === 0) {
    return [];
  }

  const userIds = Array.from(new Set(
    records.map((record) => record.authorId).filter((id): id is string => typeof id === "string" && id.length > 0)
  ));

  const shipIds = Array.from(new Set(records.map((record) => record.shipId)));
  const projectIds = Array.from(new Set(records.map((record) => record.projectId)));

  const userMap = new Map<string, UserDisplayRow>();
  const shipMap = new Map<string, ShipDisplayRow>();
  const projectMap = new Map<string, { name: string; owner: string | null; shipyard: string | null }>();

  if (userIds.length > 0) {
    const users = await db.prepare(
      `SELECT "id", "displayName", "title" FROM "users" WHERE "id" IN (${userIds.map(() => "?").join(",")})`
    ).bind(...userIds).all<UserDisplayRow>();

    for (const user of users.results ?? []) {
      userMap.set(user.id, user);
    }
  }

  if (shipIds.length > 0) {
    const ships = await db.prepare(
      `SELECT "id", "shipName", "hullNumber" FROM "ships" WHERE "id" IN (${shipIds.map(() => "?").join(",")})`
    ).bind(...shipIds).all<ShipDisplayRow>();

    for (const ship of ships.results ?? []) {
      shipMap.set(ship.id, ship);
    }
  }

  if (projectIds.length > 0) {
    const projects = await db.prepare(
      `SELECT "id", "name", "owner", "shipyard" FROM "projects" WHERE "id" IN (${projectIds.map(() => "?").join(",")})`
    ).bind(...projectIds).all<{ id: string; name: string; owner: string | null; shipyard: string | null }>();

    for (const project of projects.results ?? []) {
      projectMap.set(project.id, project);
    }
  }

  return records.map((record) => {
    const ship = shipMap.get(record.shipId);
    const authorUser = userMap.get(record.authorId);
    const project = projectMap.get(record.projectId);

    return {
      id: record.id,
      projectId: record.projectId,
      shipId: record.shipId,
      projectName: project?.name,
      projectOwner: project?.owner ?? undefined,
      projectShipyard: project?.shipyard ?? undefined,
      shipName: ship?.shipName,
      hullNumber: ship?.hullNumber,
      title: record.title,
      discipline: record.discipline,
      serialNo: record.serialNo,
      formattedSerial: ship?.hullNumber
        ? `FAT-${ship.hullNumber}-${String(record.serialNo).padStart(3, "0")}`
        : undefined,
      content: record.content,
      result: record.result,
      remark: record.remark,
      maker: record.maker,
      authorId: record.authorId,
      authorName: authorUser?.displayName,
      authorTitle: authorUser?.title ?? undefined,
      imageAttachments: record.imageAttachments,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    } satisfies FatItemResponse;
  });
}

export async function deleteFatIndex(env: Bindings, id: string): Promise<void> {
  const db = assertDb(env);
  await db.prepare('DELETE FROM "fat_index" WHERE "id" = ?').bind(id).run();
}
