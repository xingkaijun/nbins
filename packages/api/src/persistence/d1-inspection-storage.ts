import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  InspectionStorageSnapshot,
  ProjectRecord,
  ShipRecord,
  UserRecord
} from "./records.ts";
import type { InspectionStorage } from "./inspection-storage.ts";

type JsonRow = Record<string, unknown>;

export class D1InspectionStorage implements InspectionStorage {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async read(): Promise<InspectionStorageSnapshot> {
    const [users, projects, ships, inspectionItems, inspectionRounds, comments] = await Promise.all([
      this.selectAll("users"),
      this.selectAll("projects"),
      this.selectAll("ships"),
      this.selectAll("inspection_items"),
      this.selectAll("inspection_rounds"),
      this.selectAll("comments")
    ]);

    return {
      users: users.map(mapUserRecord),
      projects: projects.map(mapProjectRecord),
      ships: ships.map(mapShipRecord),
      inspectionItems: inspectionItems.map(mapInspectionItemRecord),
      inspectionRounds: inspectionRounds.map(mapInspectionRoundRecord),
      comments: comments.map(mapCommentRecord)
    };
  }

  async write(next: InspectionStorageSnapshot): Promise<void> {
    const statements: D1PreparedStatement[] = [];

    for (const tableName of ["comments", "inspection_rounds", "inspection_items", "ships", "projects", "users"]) {
      statements.push(this.db.prepare(`DELETE FROM "${tableName}"`));
    }

    for (const record of next.users) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "users" ("id", "username", "displayName", "passwordHash", "role", "disciplines", "isActive", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.username,
            record.displayName,
            record.passwordHash,
            record.role,
            JSON.stringify(record.disciplines),
            record.isActive,
            record.createdAt,
            record.updatedAt
          )
      );
    }

    for (const record of next.projects) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "projects" ("id", "name", "code", "status", "recipients", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.name,
            record.code,
            record.status,
            JSON.stringify(record.recipients),
            record.createdAt,
            record.updatedAt
          )
      );
    }

    for (const record of next.ships) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "ships" ("id", "projectId", "hullNumber", "shipName", "shipType", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.projectId,
            record.hullNumber,
            record.shipName,
            record.shipType,
            record.status,
            record.createdAt,
            record.updatedAt
          )
      );
    }

    for (const record of next.inspectionItems) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "inspection_items" ("id", "shipId", "itemName", "itemNameNormalized", "discipline", "workflowStatus", "lastRoundResult", "resolvedResult", "currentRound", "openCommentsCount", "version", "source", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.shipId,
            record.itemName,
            record.itemNameNormalized,
            record.discipline,
            record.workflowStatus,
            record.lastRoundResult,
            record.resolvedResult,
            record.currentRound,
            record.openCommentsCount,
            record.version,
            record.source,
            record.createdAt,
            record.updatedAt
          )
      );
    }

    for (const record of next.inspectionRounds) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "inspection_rounds" ("id", "inspectionItemId", "roundNumber", "rawItemName", "plannedDate", "actualDate", "yardQc", "result", "inspectedBy", "notes", "source", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.inspectionItemId,
            record.roundNumber,
            record.rawItemName,
            record.plannedDate,
            record.actualDate,
            record.yardQc,
            record.result,
            record.inspectedBy,
            record.notes,
            record.source,
            record.createdAt,
            record.updatedAt
          )
      );
    }

    for (const record of next.comments) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "comments" ("id", "inspectionItemId", "createdInRoundId", "closedInRoundId", "authorId", "content", "status", "closedBy", "closedAt", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.inspectionItemId,
            record.createdInRoundId,
            record.closedInRoundId,
            record.authorId,
            record.content,
            record.status,
            record.closedBy,
            record.closedAt,
            record.createdAt,
            record.updatedAt
          )
      );
    }

    await this.db.batch(statements);
  }

  private async selectAll(tableName: string): Promise<JsonRow[]> {
    const result = await this.db.prepare(`SELECT * FROM "${tableName}"`).all<JsonRow>();
    return result.results;
  }
}

function mapUserRecord(row: JsonRow): UserRecord {
  return {
    id: stringValue(row.id),
    username: stringValue(row.username),
    displayName: stringValue(row.displayName),
    passwordHash: stringValue(row.passwordHash),
    role: stringValue(row.role) as UserRecord["role"],
    disciplines: jsonArrayValue(row.disciplines) as UserRecord["disciplines"],
    isActive: integerValue(row.isActive) as 0 | 1,
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapProjectRecord(row: JsonRow): ProjectRecord {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    code: stringValue(row.code),
    status: stringValue(row.status) as ProjectRecord["status"],
    recipients: jsonArrayValue(row.recipients),
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapShipRecord(row: JsonRow): ShipRecord {
  return {
    id: stringValue(row.id),
    projectId: stringValue(row.projectId),
    hullNumber: stringValue(row.hullNumber),
    shipName: stringValue(row.shipName),
    shipType: nullableStringValue(row.shipType),
    status: stringValue(row.status) as ShipRecord["status"],
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapInspectionItemRecord(row: JsonRow): InspectionItemRecord {
  return {
    id: stringValue(row.id),
    shipId: stringValue(row.shipId),
    itemName: stringValue(row.itemName),
    itemNameNormalized: stringValue(row.itemNameNormalized),
    discipline: stringValue(row.discipline) as InspectionItemRecord["discipline"],
    workflowStatus: stringValue(row.workflowStatus) as InspectionItemRecord["workflowStatus"],
    lastRoundResult: nullableStringValue(row.lastRoundResult) as InspectionItemRecord["lastRoundResult"],
    resolvedResult: nullableStringValue(row.resolvedResult) as InspectionItemRecord["resolvedResult"],
    currentRound: integerValue(row.currentRound),
    openCommentsCount: integerValue(row.openCommentsCount),
    version: integerValue(row.version),
    source: stringValue(row.source) as InspectionItemRecord["source"],
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapInspectionRoundRecord(row: JsonRow): InspectionRoundRecord {
  return {
    id: stringValue(row.id),
    inspectionItemId: stringValue(row.inspectionItemId),
    roundNumber: integerValue(row.roundNumber),
    rawItemName: stringValue(row.rawItemName),
    plannedDate: nullableStringValue(row.plannedDate),
    actualDate: nullableStringValue(row.actualDate),
    yardQc: nullableStringValue(row.yardQc),
    result: nullableStringValue(row.result) as InspectionRoundRecord["result"],
    inspectedBy: nullableStringValue(row.inspectedBy),
    notes: nullableStringValue(row.notes),
    source: stringValue(row.source) as InspectionRoundRecord["source"],
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapCommentRecord(row: JsonRow): CommentRecord {
  return {
    id: stringValue(row.id),
    inspectionItemId: stringValue(row.inspectionItemId),
    createdInRoundId: stringValue(row.createdInRoundId),
    closedInRoundId: nullableStringValue(row.closedInRoundId),
    authorId: stringValue(row.authorId),
    content: stringValue(row.content),
    status: stringValue(row.status) as CommentRecord["status"],
    closedBy: nullableStringValue(row.closedBy),
    closedAt: nullableStringValue(row.closedAt),
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string value from D1");
  }

  return value;
}

function nullableStringValue(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return stringValue(value);
}

function integerValue(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("Expected numeric value from D1");
  }

  return value;
}

function jsonArrayValue(value: unknown): string[] {
  if (typeof value !== "string") {
    throw new Error("Expected JSON string value from D1");
  }

  const parsed = JSON.parse(value);

  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("Expected JSON array of strings from D1");
  }

  return parsed;
}
