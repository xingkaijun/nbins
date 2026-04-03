/**
 * Dependency-free schema metadata that mirrors the table layout we would hand to
 * Drizzle for D1/SQLite. Network access is restricted in this workspace, so the
 * repo keeps runtime dependencies unchanged while moving the storage model to a
 * Drizzle-compatible table/column shape.
 */
import type { Discipline, InspectionResult, Role, WorkflowStatus } from "@nbins/shared";
import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  ProjectRecord,
  ShipRecord,
  UserRecord
} from "../persistence/records.ts";

type SqliteStorage = "text" | "integer";

interface ColumnDefinition<T> {
  storage: SqliteStorage;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  references?: string;
  mode?: "json" | "timestamp";
  default?: T;
}

type TableDefinition<TColumns extends Record<string, ColumnDefinition<unknown>>> = {
  name: string;
  columns: TColumns;
};

function sqliteTable<TColumns extends Record<string, ColumnDefinition<unknown>>>(
  name: string,
  columns: TColumns
): TableDefinition<TColumns> {
  return { name, columns };
}

const textColumn = <T>(column: Omit<ColumnDefinition<T>, "storage"> = {}): ColumnDefinition<T> => ({
  storage: "text",
  ...column
});

const integerColumn = <T>(
  column: Omit<ColumnDefinition<T>, "storage"> = {}
): ColumnDefinition<T> => ({
  storage: "integer",
  ...column
});

export const usersTable = sqliteTable<{
  [K in keyof UserRecord]: ColumnDefinition<UserRecord[K]>;
}>("users", {
  id: textColumn<string>({ primaryKey: true }),
  username: textColumn<string>({ unique: true }),
  displayName: textColumn<string>(),
  passwordHash: textColumn<string>(),
  role: textColumn<Role>(),
  disciplines: textColumn<Discipline[]>({ mode: "json", default: [] }),
  isActive: integerColumn<0 | 1>({ default: 1 }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const projectsTable = sqliteTable<{
  [K in keyof ProjectRecord]: ColumnDefinition<ProjectRecord[K]>;
}>("projects", {
  id: textColumn<string>({ primaryKey: true }),
  name: textColumn<string>(),
  code: textColumn<string>({ unique: true }),
  status: textColumn<"active" | "archived">({ default: "active" }),
  recipients: textColumn<string[]>({ mode: "json", default: [] }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const shipsTable = sqliteTable<{
  [K in keyof ShipRecord]: ColumnDefinition<ShipRecord[K]>;
}>("ships", {
  id: textColumn<string>({ primaryKey: true }),
  projectId: textColumn<string>({ references: "projects.id" }),
  hullNumber: textColumn<string>(),
  shipName: textColumn<string>(),
  shipType: textColumn<string | null>({ nullable: true }),
  status: textColumn<"building" | "delivered">({ default: "building" }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const inspectionItemsTable = sqliteTable<{
  [K in keyof InspectionItemRecord]: ColumnDefinition<InspectionItemRecord[K]>;
}>("inspection_items", {
  id: textColumn<string>({ primaryKey: true }),
  shipId: textColumn<string>({ references: "ships.id" }),
  itemName: textColumn<string>(),
  itemNameNormalized: textColumn<string>(),
  discipline: textColumn<Discipline>(),
  workflowStatus: textColumn<WorkflowStatus>({ default: "pending" }),
  lastRoundResult: textColumn<InspectionResult | null>({ nullable: true }),
  resolvedResult: textColumn<InspectionResult | null>({ nullable: true }),
  currentRound: integerColumn<number>({ default: 1 }),
  openCommentsCount: integerColumn<number>({ default: 0 }),
  version: integerColumn<number>({ default: 1 }),
  source: textColumn<"manual" | "n8n">(),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const inspectionRoundsTable = sqliteTable<{
  [K in keyof InspectionRoundRecord]: ColumnDefinition<InspectionRoundRecord[K]>;
}>("inspection_rounds", {
  id: textColumn<string>({ primaryKey: true }),
  inspectionItemId: textColumn<string>({ references: "inspection_items.id" }),
  roundNumber: integerColumn<number>(),
  rawItemName: textColumn<string>(),
  plannedDate: textColumn<string | null>({ nullable: true }),
  actualDate: textColumn<string | null>({ nullable: true }),
  yardQc: textColumn<string | null>({ nullable: true }),
  result: textColumn<InspectionResult | null>({ nullable: true }),
  inspectedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  notes: textColumn<string | null>({ nullable: true }),
  source: textColumn<"manual" | "n8n">(),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const commentsTable = sqliteTable<{
  [K in keyof CommentRecord]: ColumnDefinition<CommentRecord[K]>;
}>("comments", {
  id: textColumn<string>({ primaryKey: true }),
  inspectionItemId: textColumn<string>({ references: "inspection_items.id" }),
  createdInRoundId: textColumn<string>({ references: "inspection_rounds.id" }),
  closedInRoundId: textColumn<string | null>({
    nullable: true,
    references: "inspection_rounds.id"
  }),
  authorId: textColumn<string>({ references: "users.id" }),
  content: textColumn<string>(),
  status: textColumn<"open" | "closed">({ default: "open" }),
  closedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  closedAt: textColumn<string | null>({ nullable: true }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const schema = {
  users: usersTable,
  projects: projectsTable,
  ships: shipsTable,
  inspectionItems: inspectionItemsTable,
  inspectionRounds: inspectionRoundsTable,
  comments: commentsTable
} as const;

export type SchemaTableName = keyof typeof schema;

export type SchemaDefinition = typeof schema;
