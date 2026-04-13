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
  ObservationRecord,
  ObservationTypeRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ShipRecord,
  UserRecord,
  NcrRecord,
  NcrIndexRecord
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
  title: textColumn<string | null>({ nullable: true }),
  disciplines: textColumn<Discipline[]>({ mode: "json", default: [] }),
  accessibleProjectIds: textColumn<string[]>({ mode: "json", default: [] }),
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
  owner: textColumn<string | null>({ nullable: true }),
  shipyard: textColumn<string | null>({ nullable: true }),
  class: textColumn<string | null>({ nullable: true }),
  disciplines: textColumn<string[]>({ mode: "json", default: [] }),
  reportRecipients: textColumn<string[]>({ mode: "json", default: [] }),
  ncrRecipients: textColumn<string[]>({ mode: "json", default: [] }),
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

export const projectMembersTable = sqliteTable<{
  [K in keyof ProjectMemberRecord]: ColumnDefinition<ProjectMemberRecord[K]>;
}>("project_members", {
  id: textColumn<string>({ primaryKey: true }),
  projectId: textColumn<string>({ references: "projects.id" }),
  userId: textColumn<string>({ references: "users.id" }),
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
  localId: integerColumn<number>({ default: 0 }),
  content: textColumn<string>(),
  status: textColumn<"open" | "closed">({ default: "open" }),
  closedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  closedAt: textColumn<string | null>({ nullable: true }),
  resolveRemark: textColumn<string | null>({ nullable: true }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

// ---- 巡检/试航意见模块 ----

export const observationTypesTable = sqliteTable<{
  [K in keyof ObservationTypeRecord]: ColumnDefinition<ObservationTypeRecord[K]>;
}>("observation_types", {
  id: textColumn<string>({ primaryKey: true }),
  code: textColumn<string>({ unique: true }),
  label: textColumn<string>(),
  sortOrder: integerColumn<number>({ default: 0 }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const observationsTable = sqliteTable<{
  [K in keyof ObservationRecord]: ColumnDefinition<ObservationRecord[K]>;
}>("observations", {
  id: textColumn<string>({ primaryKey: true }),
  shipId: textColumn<string>({ references: "ships.id" }),
  type: textColumn<string>(),
  discipline: textColumn<Discipline>(),
  authorId: textColumn<string>({ references: "users.id" }),
  serialNo: integerColumn<number>({ default: 0 }),
  location: textColumn<string | null>({ nullable: true }),
  date: textColumn<string>(),
  content: textColumn<string>(),
  remark: textColumn<string | null>({ nullable: true }),
  status: textColumn<"open" | "closed">({ default: "open" }),
  closedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  closedAt: textColumn<string | null>({ nullable: true }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const ncrsTable = sqliteTable<{
  [K in keyof NcrRecord]: ColumnDefinition<NcrRecord[K]>;
}>("ncrs", {
  id: textColumn<string>({ primaryKey: true }),
  shipId: textColumn<string>({ references: "ships.id" }),
  title: textColumn<string>(),
  content: textColumn<string>(),
  authorId: textColumn<string>({ references: "users.id" }),
  status: textColumn<"draft" | "pending_approval" | "approved" | "rejected">({ default: "draft" }),
  approvedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  approvedAt: textColumn<string | null>({ nullable: true }),
  pdfObjectKey: textColumn<string | null>({ nullable: true }),
  builderReply: textColumn<string | null>({ nullable: true }),
  replyDate: textColumn<string | null>({ nullable: true }),
  verifiedBy: textColumn<string | null>({ nullable: true }),
  verifyDate: textColumn<string | null>({ nullable: true }),
  closedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  closedAt: textColumn<string | null>({ nullable: true }),
  rectifyRequest: textColumn<string | null>({ nullable: true }),
  attachments: textColumn<string[]>({ mode: "json", default: [] }),
  createdAt: textColumn<string>(),
  updatedAt: textColumn<string>()
});

export const ncrIndexTable = sqliteTable<{
  [K in keyof NcrIndexRecord]: ColumnDefinition<NcrIndexRecord[K]>;
}>("ncr_index", {
  id: textColumn<string>({ primaryKey: true }),
  projectId: textColumn<string>({ references: "projects.id" }),
  shipId: textColumn<string>({ references: "ships.id" }),
  title: textColumn<string>(),
  discipline: textColumn<string>(),
  serialNo: integerColumn<number>({ default: 0 }),
  remark: textColumn<string | null>({ nullable: true }),
  status: textColumn<"draft" | "pending_approval" | "approved" | "rejected">({ default: "draft" }),
  authorId: textColumn<string>({ references: "users.id" }),
  approvedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  approvedAt: textColumn<string | null>({ nullable: true }),
  pdfObjectKey: textColumn<string | null>({ nullable: true }),
  fileCount: integerColumn<number>({ default: 0 }),
  builderReply: textColumn<string | null>({ nullable: true }),
  replyDate: textColumn<string | null>({ nullable: true }),
  verifiedBy: textColumn<string | null>({ nullable: true }),
  verifyDate: textColumn<string | null>({ nullable: true }),
  closedBy: textColumn<string | null>({ nullable: true, references: "users.id" }),
  closedAt: textColumn<string | null>({ nullable: true }),
  createdAt: textColumn<string>(),

  updatedAt: textColumn<string>()
});

export const schema = {

  users: usersTable,
  projects: projectsTable,
  projectMembers: projectMembersTable,
  ships: shipsTable,
  inspectionItems: inspectionItemsTable,
  inspectionRounds: inspectionRoundsTable,
  comments: commentsTable,
  ncrs: ncrsTable,
  ncrIndex: ncrIndexTable,
  observationTypes: observationTypesTable,

  observations: observationsTable
} as const;

export type SchemaTableName = keyof typeof schema;

export type SchemaDefinition = typeof schema;
