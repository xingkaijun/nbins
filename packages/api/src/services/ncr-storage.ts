import type { D1Database } from "@cloudflare/workers-types";
import type { NcrIndexRecord } from "../persistence/records.ts";
import type { Bindings } from "../env.ts";
import type { AuthenticatedUser } from "../auth.ts";
import type { NcrItemResponse, NcrPdfMeta, NcrRelatedFile } from "@nbins/shared";
import { resolveAllowedProjectIds } from "../routes/route-helpers.ts";

export interface StoredNcrRecord {
  id: string;
  projectId: string;
  shipId: string;
  title: string;
  discipline: string;
  serialNo: number;
  content: string;
  remark: string | null;
  authorId: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  imageAttachments: string[];
  relatedFiles: NcrRelatedFile[];
  pdf: NcrPdfMeta | null;
  builderReply: string | null;
  replyDate: string | null;
  verifiedBy: string | null;
  verifyDate: string | null;
  rectifyRequest: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipContext {
  id: string;
  projectId: string;
  shipName: string;
  hullNumber: string;
}

interface UserDisplayRow {
  id: string;
  displayName: string;
}

interface ShipDisplayRow {
  id: string;
  shipName: string;
  hullNumber: string;
}

interface QueryNcrIndexFilters {
  projectId?: string;
  shipId?: string;
  status?: StoredNcrRecord["status"];
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

function parseRelatedFiles(value: unknown): NcrRelatedFile[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map(mapRelatedFile)
      .filter((entry): entry is NcrRelatedFile => entry !== null);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map(mapRelatedFile)
      .filter((entry): entry is NcrRelatedFile => entry !== null);
  } catch {
    return [];
  }
}

function mapRelatedFile(raw: Record<string, unknown>): NcrRelatedFile | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.objectKey !== "string") {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name,
    objectKey: raw.objectKey,
    contentType: typeof raw.contentType === "string" ? raw.contentType : "application/octet-stream",
    size: typeof raw.size === "number" ? raw.size : Number(raw.size ?? 0),
    uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy : "",
    uploadedByName: typeof raw.uploadedByName === "string" ? raw.uploadedByName : undefined,
    uploadedAt: typeof raw.uploadedAt === "string" ? raw.uploadedAt : new Date().toISOString()
  };
}

function parsePdfMeta(value: unknown): NcrPdfMeta | null {
  if (!value) {
    return null;
  }

  const raw = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : typeof value === "object"
      ? value as Record<string, unknown>
      : null;

  if (!raw || typeof raw.objectKey !== "string" || typeof raw.generatedAt !== "string") {
    return null;
  }

  return {
    objectKey: raw.objectKey,
    generatedAt: raw.generatedAt,
    version: typeof raw.version === "number" ? raw.version : Number(raw.version ?? 1)
  };
}

export const MEDIA_VARIANTS = ["original", "medium", "thumb"] as const;

export type MediaVariant = typeof MEDIA_VARIANTS[number];

export function sanitizeFilename(value: string): string {
  const trimmed = value.trim();
  const safe = trimmed
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || `file-${crypto.randomUUID()}`;
}

function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "") || filename;
}

function normalizeMediaBaseId(baseId: string): string {
  const safe = baseId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return safe || crypto.randomUUID();
}

export function buildMediaFilename(baseId: string, originalName: string, variant: MediaVariant = "original"): string {
  const normalizedBaseId = normalizeMediaBaseId(baseId);
  const safeBaseName = sanitizeFilename(stripFileExtension(originalName));
  const suffix = variant === "original" ? "" : `_${variant}`;
  return `${normalizedBaseId}-${safeBaseName}${suffix}.webp`;
}

export function getCanonicalMediaOriginalFilename(filename: string): string {
  return filename.replace(/_(thumb|medium)(?=\.webp$)/i, "");
}

export function deriveMediaVariantFilename(filename: string, variant: MediaVariant): string {
  const originalFilename = getCanonicalMediaOriginalFilename(filename);
  if (variant === "original") {
    return originalFilename;
  }

  const base = stripFileExtension(originalFilename);
  return `${base}_${variant}.webp`;
}

export function getMediaVariantFilenames(filename: string): string[] {
  const originalFilename = getCanonicalMediaOriginalFilename(filename);
  return [
    originalFilename,
    deriveMediaVariantFilename(originalFilename, "medium"),
    deriveMediaVariantFilename(originalFilename, "thumb")
  ];
}

export function isDerivedMediaVariant(filename: string): boolean {
  return /_(thumb|medium)\.webp$/i.test(filename);
}

export function getNcrObjectKey(shipId: string, ncrId: string): string {
  return `ncrs/${shipId}/${ncrId}.json`;
}

export function getMediaObjectKey(shipId: string, filename: string): string {
  return `media/${shipId}/${filename}`;
}

export function getNcrFileObjectKey(shipId: string, ncrId: string, fileId: string, filename: string): string {
  return `ncr-files/${shipId}/${ncrId}/${fileId}-${sanitizeFilename(filename)}`;
}

export function getNcrPdfObjectKey(shipId: string, ncrId: string): string {
  return `ncr-pdf/${shipId}/${ncrId}/latest.pdf`;
}

export function getObjectFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
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

export async function getShipContextByShipId(db: D1Database, shipId: string): Promise<ShipContext | null> {
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

export function normalizeStoredNcrRecord(raw: Record<string, unknown>): StoredNcrRecord {
  const imageAttachments = parseStringArray(raw.imageAttachments ?? raw.attachments);
  return {
    id: String(raw.id),
    projectId: String(raw.projectId),
    shipId: String(raw.shipId),
    title: String(raw.title),
    discipline: typeof raw.discipline === "string" ? raw.discipline : "GENERAL",
    serialNo: typeof raw.serialNo === "number" ? raw.serialNo : Number(raw.serialNo ?? 0),
    content: String(raw.content),
    remark: typeof raw.remark === "string" ? raw.remark : null,
    authorId: String(raw.authorId),
    status: (raw.status as StoredNcrRecord["status"]) ?? "draft",
    approvedBy: typeof raw.approvedBy === "string" ? raw.approvedBy : null,
    approvedAt: typeof raw.approvedAt === "string" ? raw.approvedAt : null,
    imageAttachments,
    relatedFiles: parseRelatedFiles(raw.relatedFiles),
    pdf: parsePdfMeta(raw.pdf),
    builderReply: typeof raw.builderReply === "string" ? raw.builderReply : null,
    replyDate: typeof raw.replyDate === "string" ? raw.replyDate : null,
    verifiedBy: typeof raw.verifiedBy === "string" ? raw.verifiedBy : null,
    verifyDate: typeof raw.verifyDate === "string" ? raw.verifyDate : null,
    rectifyRequest: typeof raw.rectifyRequest === "string" ? raw.rectifyRequest : null,
    closedBy: typeof raw.closedBy === "string" ? raw.closedBy : null,
    closedAt: typeof raw.closedAt === "string" ? raw.closedAt : null,
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt)
  };
}

export async function writeStoredNcr(env: Bindings, record: StoredNcrRecord): Promise<void> {
  const bucket = assertBucket(env);
  await bucket.put(getNcrObjectKey(record.shipId, record.id), JSON.stringify(record, null, 2), {
    httpMetadata: {
      contentType: "application/json"
    }
  });
}

export async function readStoredNcrByIndex(env: Bindings, indexRow: Pick<NcrIndexRecord, "id" | "shipId">): Promise<StoredNcrRecord | null> {
  const bucket = assertBucket(env);
  const object = await bucket.get(getNcrObjectKey(indexRow.shipId, indexRow.id));
  if (!object) {
    return null;
  }

  const text = await object.text();
  try {
    return normalizeStoredNcrRecord(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getNcrIndexById(env: Bindings, id: string): Promise<NcrIndexRecord | null> {
  const db = assertDb(env);
  const row = await db
    .prepare('SELECT * FROM "ncr_index" WHERE "id" = ?')
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) {
    return null;
  }

  return mapNcrIndexRecord(row);
}

export async function readStoredNcrById(env: Bindings, id: string): Promise<StoredNcrRecord | null> {
  const indexRow = await getNcrIndexById(env, id);
  if (!indexRow) {
    return null;
  }

  return readStoredNcrByIndex(env, indexRow);
}

export function mapNcrIndexRecord(row: Record<string, unknown>): NcrIndexRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    shipId: String(row.shipId),
    title: String(row.title),
    discipline: String(row.discipline),
    serialNo: typeof row.serialNo === "number" ? row.serialNo : Number(row.serialNo ?? 0),
    remark: typeof row.remark === "string" ? row.remark : null,
    status: (row.status as NcrIndexRecord["status"]) ?? "draft",
    authorId: String(row.authorId),
    approvedBy: typeof row.approvedBy === "string" ? row.approvedBy : null,
    approvedAt: typeof row.approvedAt === "string" ? row.approvedAt : null,
    pdfObjectKey: typeof row.pdfObjectKey === "string" ? row.pdfObjectKey : null,
    fileCount: typeof row.fileCount === "number" ? row.fileCount : Number(row.fileCount ?? 0),
    builderReply: typeof row.builderReply === "string" ? row.builderReply : null,
    replyDate: typeof row.replyDate === "string" ? row.replyDate : null,
    verifiedBy: typeof row.verifiedBy === "string" ? row.verifiedBy : null,
    verifyDate: typeof row.verifyDate === "string" ? row.verifyDate : null,
    closedBy: typeof row.closedBy === "string" ? row.closedBy : null,

    closedAt: typeof row.closedAt === "string" ? row.closedAt : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export async function upsertNcrIndex(env: Bindings, record: StoredNcrRecord): Promise<void> {
  const db = assertDb(env);
  await db.prepare(
    `INSERT INTO "ncr_index" (
      "id", "projectId", "shipId", "title", "discipline", "serialNo", "remark", "status", "authorId", "approvedBy", "approvedAt", "pdfObjectKey", "fileCount", 
      "builderReply", "replyDate", "verifiedBy", "verifyDate", "closedBy", "closedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT("id") DO UPDATE SET
      "projectId" = excluded."projectId",
      "shipId" = excluded."shipId",
      "title" = excluded."title",
      "discipline" = excluded."discipline",
      "serialNo" = excluded."serialNo",
      "remark" = excluded."remark",
      "status" = excluded."status",
      "authorId" = excluded."authorId",
      "approvedBy" = excluded."approvedBy",
      "approvedAt" = excluded."approvedAt",
      "pdfObjectKey" = excluded."pdfObjectKey",
      "fileCount" = excluded."fileCount",
      "builderReply" = excluded."builderReply",
      "replyDate" = excluded."replyDate",
      "verifiedBy" = excluded."verifiedBy",
      "verifyDate" = excluded."verifyDate",
      "closedBy" = excluded."closedBy",
      "closedAt" = excluded."closedAt",
      "createdAt" = excluded."createdAt",
      "updatedAt" = excluded."updatedAt"`
  ).bind(
    record.id,
    record.projectId,
    record.shipId,
    record.title,
    record.discipline,
    record.serialNo,
    record.remark,
    record.status,
    record.authorId,
    record.approvedBy,
    record.approvedAt,
    record.pdf?.objectKey ?? null,
    record.relatedFiles.length,
    record.builderReply,
    record.replyDate,
    record.verifiedBy,
    record.verifyDate,
    record.closedBy,
    record.closedAt,
    record.createdAt,
    record.updatedAt
  ).run();

}

export async function getNextNcrSerialNo(env: Bindings, shipId: string): Promise<number> {
  const db = assertDb(env);
  const result = await db
    .prepare('SELECT MAX("serialNo") as maxSerial FROM "ncr_index" WHERE "shipId" = ?')
    .bind(shipId)
    .first<{ maxSerial: number | null }>();
  return (result?.maxSerial ?? 0) + 1;
}

export async function queryNcrIndex(
  env: Bindings,
  user: AuthenticatedUser,
  filters: QueryNcrIndexFilters
): Promise<NcrIndexRecord[]> {
  const db = assertDb(env);
  const isAdmin = user.role === "admin";
  const allowedProjectIds = isAdmin ? [] : await resolveAllowedProjectIds(db, user.id);

  if (!isAdmin && allowedProjectIds.length === 0) {
    return [];
  }

  if (!isAdmin && filters.projectId && !allowedProjectIds.includes(filters.projectId)) {
    return [];
  }

  let sql = 'SELECT * FROM "ncr_index" WHERE 1 = 1';
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

  if (filters.status) {
    sql += ' AND "status" = ?';
    params.push(filters.status);
  }

  if (filters.keyword && filters.keyword.trim().length > 0) {
    sql += ` AND (LOWER("title") LIKE ? ESCAPE '\\' OR LOWER(COALESCE("remark", '')) LIKE ? ESCAPE '\\')`;
    const escaped = filters.keyword.trim().toLowerCase().replace(/[%_\\]/g, "\\$&");
    const normalized = `%${escaped}%`;
    params.push(normalized, normalized);
  }

  sql += ' ORDER BY "updatedAt" DESC, "createdAt" DESC';

  const result = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapNcrIndexRecord);
}

export async function hydrateNcrResponses(env: Bindings, records: StoredNcrRecord[]): Promise<NcrItemResponse[]> {
  const db = assertDb(env);
  if (records.length === 0) {
    return [];
  }

  const userIds = Array.from(new Set(
    records.flatMap((record) => [
      record.authorId,
      record.approvedBy,
      record.closedBy,
      ...record.relatedFiles.map((file) => file.uploadedBy)
    ]).filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  ));

  const shipIds = Array.from(new Set(records.map((record) => record.shipId)));
  const projectIds = Array.from(new Set(records.map((record) => record.projectId)));
  const userMap = new Map<string, string>();
  const shipMap = new Map<string, ShipDisplayRow>();
  const projectMap = new Map<string, string>();

  if (userIds.length > 0) {
    const users = await db.prepare(
      `SELECT "id", "displayName" FROM "users" WHERE "id" IN (${userIds.map(() => "?").join(",")})`
    ).bind(...userIds).all<UserDisplayRow>();

    for (const user of users.results ?? []) {
      userMap.set(user.id, user.displayName);
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
      `SELECT "id", "name" FROM "projects" WHERE "id" IN (${projectIds.map(() => "?").join(",")})`
    ).bind(...projectIds).all<{ id: string; name: string }>();

    for (const project of projects.results ?? []) {
      projectMap.set(project.id, project.name);
    }
  }

  return records.map((record) => {
    const ship = shipMap.get(record.shipId);
    const relatedFiles = record.relatedFiles.map((file) => ({
      ...file,
      uploadedByName: userMap.get(file.uploadedBy) ?? file.uploadedByName
    }));

    return {
      id: record.id,
      projectId: record.projectId,
      shipId: record.shipId,
      projectName: projectMap.get(record.projectId),
      shipName: ship?.shipName,
      hullNumber: ship?.hullNumber,
      title: record.title,
      discipline: record.discipline,
      serialNo: record.serialNo,
      formattedSerial: ship?.hullNumber 
        ? `NCR-${ship.hullNumber}-${String(record.serialNo).padStart(3, "0")}`
        : undefined,
      content: record.content,
      remark: record.remark,
      authorId: record.authorId,
      authorName: userMap.get(record.authorId),
      status: record.status,
      approvedBy: record.approvedBy,
      approvedByName: record.approvedBy ? userMap.get(record.approvedBy) : undefined,
      approvedAt: record.approvedAt,
      imageAttachments: record.imageAttachments,
      attachments: record.imageAttachments,
      relatedFiles,
      pdf: record.pdf,
      builderReply: record.builderReply,
      replyDate: record.replyDate,
      verifiedBy: record.verifiedBy,
      verifyDate: record.verifyDate,
      rectifyRequest: record.rectifyRequest,
      closedBy: record.closedBy,
      closedByName: record.closedBy ? userMap.get(record.closedBy) : undefined,
      closedAt: record.closedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    } satisfies NcrItemResponse;
  });
}

export async function deleteNcrIndex(env: Bindings, id: string): Promise<void> {
  const db = assertDb(env);
  await db.prepare('DELETE FROM "ncr_index" WHERE "id" = ?').bind(id).run();
}
