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
import type {
  InspectionListStorageRecord,
  InspectionDetailStorageRecord,
  InspectionSubmissionContextRecord,
  InspectionStorage,
  SubmitCurrentRoundResultStorageMutation,
  ResolveCommentStorageMutation
} from "./inspection-storage.ts";
import {
  INSPECTION_DETAIL_SUMMARY_SQL,
  INSPECTION_LIST_SUMMARY_SQL
} from "./d1-inspection-sql.ts";

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

  async readInspectionList(): Promise<InspectionListStorageRecord> {
    const summaryRows = await this.selectMany(INSPECTION_LIST_SUMMARY_SQL);
    const inspectionItemIds = summaryRows.map((row) => stringValue(row.item_id));
    const roundsByKey = new Map(
      (
         inspectionItemIds.length === 0
          ? []
          : await this.selectRoundsByInspectionItemIds(inspectionItemIds)
      ).map((record) => [`${record.inspectionItemId}:${record.roundNumber}`, record])
    );

    return {
      generatedAt: new Date().toISOString(),
      items: summaryRows.map((row) => {
        const item = mapInspectionItemSummaryRecord(row);
        const ship = mapShipSummaryRecord(row);
        const project = mapProjectSummaryRecord(row);
        const currentRound = roundsByKey.get(`${item.id}:${item.currentRound}`);

        if (!currentRound) {
          throw new Error(`Expected current round for inspection item ${item.id}`);
        }

        return { item, ship, project, currentRound };
      })
    };
  }

  async readInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    return this.readInspectionDetailRecord(inspectionItemId);
  }

  async readSubmittedInspectionDetail(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    return this.readInspectionDetailRecord(inspectionItemId);
  }

  private async readInspectionDetailRecord(
    inspectionItemId: string
  ): Promise<InspectionDetailStorageRecord | null> {
    const summaryRow = await this.selectFirst(
      INSPECTION_DETAIL_SUMMARY_SQL,
      inspectionItemId
    );

    if (!summaryRow) {
      return null;
    }

    const [roundRows, commentRows] = await Promise.all([
      this.selectMany(
        `SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?`,
        inspectionItemId
      ),
      this.selectMany(`SELECT * FROM "comments" WHERE "inspectionItemId" = ?`, inspectionItemId)
    ]);
    const rounds = roundRows.map(mapInspectionRoundRecord);
    const comments = commentRows.map(mapCommentRecord);
    const userIds = Array.from(
      new Set(
        [
          ...rounds.map((record) => record.inspectedBy),
          ...comments.map((record) => record.authorId),
          ...comments.map((record) => record.closedBy)
        ].filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );

    return {
      item: mapInspectionItemSummaryRecord(summaryRow),
      ship: mapShipSummaryRecord(summaryRow),
      project: mapProjectSummaryRecord(summaryRow),
      rounds: rounds.sort((left, right) => left.roundNumber - right.roundNumber),
      comments: comments.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      users:
        userIds.length === 0
          ? []
          : await this.selectUsersByIds(userIds)
    };
  }

  async readSubmissionContext(
    inspectionItemId: string
  ): Promise<InspectionSubmissionContextRecord | null> {
    const itemRow = await this.selectFirst(
      `SELECT * FROM "inspection_items" WHERE "id" = ?`,
      inspectionItemId
    );

    if (!itemRow) {
      return null;
    }

    const item = mapInspectionItemRecord(itemRow);
    const [roundRow, openCommentCount] = await Promise.all([
      this.selectFirst(
        `SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?`,
        inspectionItemId,
        item.currentRound
      ),
      this.countOpenComments(inspectionItemId)
    ]);

    if (!roundRow) {
      throw new Error("INSPECTION_ROUND_NOT_FOUND");
    }

    return {
      item,
      currentRound: mapInspectionRoundRecord(roundRow),
      openCommentCount
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
            `INSERT INTO "projects" ("id", "name", "code", "status", "owner", "shipyard", "class", "recipients", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.name,
            record.code,
            record.status,
            record.owner,
            record.shipyard,
            record.class,
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
            `INSERT INTO "comments" ("id", "inspectionItemId", "createdInRoundId", "closedInRoundId", "authorId", "localId", "content", "status", "closedBy", "closedAt", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.inspectionItemId,
            record.createdInRoundId,
            record.closedInRoundId,
            record.authorId,
            record.localId,
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

  async submitCurrentRoundResult(
    mutation: SubmitCurrentRoundResultStorageMutation
  ): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE "inspection_rounds"
           SET "actualDate" = ?, "result" = ?, "inspectedBy" = ?, "notes" = ?, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .bind(
          mutation.inspectionRound.actualDate,
          mutation.inspectionRound.result,
          mutation.inspectionRound.inspectedBy,
          mutation.inspectionRound.notes,
          mutation.inspectionRound.updatedAt,
          mutation.inspectionRound.id
        ),
      this.db
        .prepare(
          `UPDATE "inspection_items"
           SET "workflowStatus" = ?, "lastRoundResult" = ?, "resolvedResult" = ?, "openCommentsCount" = ?, "version" = ?, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .bind(
          mutation.inspectionItem.workflowStatus,
          mutation.inspectionItem.lastRoundResult,
          mutation.inspectionItem.resolvedResult,
          mutation.inspectionItem.openCommentsCount,
          mutation.inspectionItem.version,
          mutation.inspectionItem.updatedAt,
          mutation.inspectionItem.id
        )
    ];

    for (const record of mutation.createdComments) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO "comments" ("id", "inspectionItemId", "createdInRoundId", "closedInRoundId", "authorId", "localId", "content", "status", "closedBy", "closedAt", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            record.inspectionItemId,
            record.createdInRoundId,
            record.closedInRoundId,
            record.authorId,
            record.localId,
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

  async resolveComment(mutation: ResolveCommentStorageMutation): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE "comments"
           SET "status" = ?, "closedBy" = ?, "closedAt" = ?, "closedInRoundId" = ?, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .bind(
          mutation.comment.status,
          mutation.comment.closedBy,
          mutation.comment.closedAt,
          mutation.comment.closedInRoundId,
          mutation.comment.updatedAt,
          mutation.comment.id
        ),
      this.db
        .prepare(
          `UPDATE "inspection_items"
           SET "workflowStatus" = ?, "resolvedResult" = ?, "openCommentsCount" = ?, "version" = ?, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .bind(
          mutation.inspectionItem.workflowStatus,
          mutation.inspectionItem.resolvedResult,
          mutation.inspectionItem.openCommentsCount,
          mutation.inspectionItem.version,
          mutation.inspectionItem.updatedAt,
          mutation.inspectionItem.id
        )
    ];

    await this.db.batch(statements);
  }

  private async selectAll(tableName: string): Promise<JsonRow[]> {
    const result = await this.db.prepare(`SELECT * FROM "${tableName}"`).all<JsonRow>();
    return result.results;
  }

  private async selectMany(sql: string, ...params: unknown[]): Promise<JsonRow[]> {
    const result = await this.db.prepare(sql).bind(...params).all<JsonRow>();
    return result.results;
  }

  private async selectFirst(sql: string, ...params: unknown[]): Promise<JsonRow | null> {
    const [row] = await this.selectMany(sql, ...params);
    return row ?? null;
  }

  private async selectRequired(sql: string, ...params: unknown[]): Promise<JsonRow> {
    const row = await this.selectFirst(sql, ...params);

    if (!row) {
      throw new Error(`Expected row for query: ${sql}`);
    }

    return row;
  }

  private async countOpenComments(inspectionItemId: string): Promise<number> {
    const row = await this.selectRequired(
      `SELECT COUNT(*) AS "count" FROM "comments" WHERE "inspectionItemId" = ? AND "status" = ?`,
      inspectionItemId,
      "open"
    );
    return integerValue(row.count);
  }

  private async selectUsersByIds(userIds: string[]): Promise<UserRecord[]> {
    const placeholders = userIds.map(() => "?").join(", ");
    const rows = await this.selectMany(
      `SELECT * FROM "users" WHERE "id" IN (${placeholders})`,
      ...userIds
    );
    const usersById = new Map(rows.map((row) => [stringValue(row.id), mapUserRecord(row)]));

    return userIds.map((userId) => {
      const user = usersById.get(userId);

      if (!user) {
        throw new Error(`Expected row for query: SELECT * FROM "users" WHERE "id" IN (${placeholders})`);
      }

      return user;
    });
  }

  private async selectShipsByIds(shipIds: string[]): Promise<ShipRecord[]> {
    const placeholders = shipIds.map(() => "?").join(", ");
    const rows = await this.selectMany(
      `SELECT * FROM "ships" WHERE "id" IN (${placeholders})`,
      ...shipIds
    );
    const shipsById = new Map(rows.map((row) => [stringValue(row.id), mapShipRecord(row)]));

    return shipIds.map((shipId) => {
      const ship = shipsById.get(shipId);

      if (!ship) {
        throw new Error(`Expected row for query: SELECT * FROM "ships" WHERE "id" IN (${placeholders})`);
      }

      return ship;
    });
  }

  private async selectProjectsByIds(projectIds: string[]): Promise<ProjectRecord[]> {
    const placeholders = projectIds.map(() => "?").join(", ");
    const rows = await this.selectMany(
      `SELECT * FROM "projects" WHERE "id" IN (${placeholders})`,
      ...projectIds
    );
    const projectsById = new Map(rows.map((row) => [stringValue(row.id), mapProjectRecord(row)]));

    return projectIds.map((projectId) => {
      const project = projectsById.get(projectId);

      if (!project) {
        throw new Error(`Expected row for query: SELECT * FROM "projects" WHERE "id" IN (${placeholders})`);
      }

      return project;
    });
  }

  private async selectRoundsByInspectionItemIds(
    inspectionItemIds: string[]
  ): Promise<InspectionRoundRecord[]> {
    const placeholders = inspectionItemIds.map(() => "?").join(", ");
    const rows = await this.selectMany(
      `SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (${placeholders})`,
      ...inspectionItemIds
    );

    return rows.map(mapInspectionRoundRecord);
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
    owner: nullableStringValue(row.owner),
    shipyard: nullableStringValue(row.shipyard),
    class: nullableStringValue(row.class),
    recipients: jsonArrayValue(row.recipients),
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt)
  };
}

function mapInspectionItemSummaryRecord(row: JsonRow): InspectionItemRecord {
  return {
    id: stringValue(row.item_id),
    shipId: stringValue(row.item_shipId),
    itemName: stringValue(row.item_itemName),
    itemNameNormalized: stringValue(row.item_itemNameNormalized),
    discipline: stringValue(row.item_discipline) as InspectionItemRecord["discipline"],
    workflowStatus: stringValue(row.item_workflowStatus) as InspectionItemRecord["workflowStatus"],
    lastRoundResult: nullableStringValue(row.item_lastRoundResult) as InspectionItemRecord["lastRoundResult"],
    resolvedResult: nullableStringValue(row.item_resolvedResult) as InspectionItemRecord["resolvedResult"],
    currentRound: integerValue(row.item_currentRound),
    openCommentsCount: integerValue(row.item_openCommentsCount),
    version: integerValue(row.item_version),
    source: stringValue(row.item_source) as InspectionItemRecord["source"],
    createdAt: stringValue(row.item_createdAt),
    updatedAt: stringValue(row.item_updatedAt)
  };
}

function mapShipSummaryRecord(row: JsonRow): ShipRecord {
  return {
    id: stringValue(row.ship_id),
    projectId: stringValue(row.ship_projectId),
    hullNumber: stringValue(row.ship_hullNumber),
    shipName: stringValue(row.ship_shipName),
    shipType: nullableStringValue(row.ship_shipType),
    status: stringValue(row.ship_status) as ShipRecord["status"],
    createdAt: stringValue(row.ship_createdAt),
    updatedAt: stringValue(row.ship_updatedAt)
  };
}

function mapProjectSummaryRecord(row: JsonRow): ProjectRecord {
  return {
    id: stringValue(row.project_id),
    name: stringValue(row.project_name),
    code: stringValue(row.project_code),
    status: stringValue(row.project_status) as ProjectRecord["status"],
    owner: nullableStringValue(row.project_owner),
    shipyard: nullableStringValue(row.project_shipyard),
    class: nullableStringValue(row.project_class),
    recipients: jsonArrayValue(row.project_recipients),
    createdAt: stringValue(row.project_createdAt),
    updatedAt: stringValue(row.project_updatedAt)
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
    localId: integerValue(row.localId),
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
