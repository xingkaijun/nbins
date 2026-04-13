import type {
  ProjectRecord,
  UserRecord
} from "../persistence/records.ts";

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => (entry === "MACHINERY" ? "MACH" : entry));
  } catch {
    return [];
  }
}

export async function resolveAllowedProjectIds(db: D1Database, userId: string): Promise<string[]> {
  const [userRow, membershipRows] = await Promise.all([
    db.prepare('SELECT "accessibleProjectIds" FROM "users" WHERE "id" = ?')
      .bind(userId)
      .first<Record<string, unknown>>(),
    db.prepare('SELECT "projectId" FROM "project_members" WHERE "userId" = ?')
      .bind(userId)
      .all<Record<string, unknown>>()
  ]);

  const ids = new Set(parseStringArray(userRow?.accessibleProjectIds));

  for (const row of membershipRows.results ?? []) {
    if (typeof row.projectId === "string" && row.projectId.trim()) {
      ids.add(row.projectId);
    }
  }

  return [...ids];
}


export function mapProjectRecord(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    status: row.status === "archived" ? "archived" : "active",
    owner: typeof row.owner === "string" ? row.owner : null,
    shipyard: typeof row.shipyard === "string" ? row.shipyard : null,
    class: typeof row.class === "string" ? row.class : null,
    disciplines: parseStringArray(row.disciplines),
    reportRecipients: parseStringArray(row.reportRecipients),
    ncrRecipients: parseStringArray(row.ncrRecipients),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export function mapUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.displayName),
    passwordHash: "",
    role: row.role as UserRecord["role"],
    title: row.title ? String(row.title) : null,
    disciplines: parseStringArray(row.disciplines) as UserRecord["disciplines"],
    accessibleProjectIds: parseStringArray(row.accessibleProjectIds),
    isActive: row.isActive === 0 || row.isActive === "0" || row.isActive === false ? 0 : 1,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}
