import { DEFAULT_OBSERVATION_TYPES } from "@nbins/shared";
import type {
  ObservationRecord,
  ObservationTypeRecord,
  ProjectRecord,
  UserRecord
} from "../persistence/records.ts";
import type { Bindings } from "../env.ts";

export function isD1Enabled(bindings: Bindings | undefined | null): boolean {
  return Boolean(bindings) && (bindings as Bindings).D1_DRIVER === "d1" && Boolean((bindings as Bindings).DB);
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
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
    disciplines: parseStringArray(row.disciplines) as UserRecord["disciplines"],
    accessibleProjectIds: parseStringArray(row.accessibleProjectIds),
    isActive: row.isActive === 0 || row.isActive === "0" || row.isActive === false ? 0 : 1,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

const mockObservationNow = new Date().toISOString();

export const mockObservationTypes: ObservationTypeRecord[] = DEFAULT_OBSERVATION_TYPES.map(
  (type, index) => ({
    id: `observation-type-${type.code}`,
    code: type.code,
    label: type.label,
    sortOrder: index,
    createdAt: mockObservationNow,
    updatedAt: mockObservationNow
  })
);

export const mockObservations: ObservationRecord[] = [];
