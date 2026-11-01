import { schema, type ColumnDefinition, type SchemaDefinition } from "./schema.ts";

const TABLE_ORDER = [
  "users",
  "projects",
  "projectMembers",
  "ships",
  "inspectionItems",
  "inspectionRounds",
  "comments",
  "ncrs",
  "ncrIndex",
  "observationTypes",
  "observations",
  "fatIndex"
] as const satisfies ReadonlyArray<keyof SchemaDefinition>;

export function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function mapColumnType(storage: "text" | "integer"): string {
  return storage === "integer" ? "INTEGER" : "TEXT";
}

function mapDefaultValue(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

/** Column definition as used in CREATE TABLE (and, without key clauses, ALTER TABLE ADD COLUMN). */
export function columnDefinitionSql(
  columnName: string,
  column: ColumnDefinition<unknown>,
  options: { forAddColumn?: boolean } = {}
): string {
  const parts = [quoteIdentifier(columnName), mapColumnType(column.storage)];

  if (column.primaryKey && !options.forAddColumn) {
    parts.push("PRIMARY KEY");
  }

  if (!column.nullable && !column.primaryKey) {
    parts.push("NOT NULL");
  }

  if (column.unique && !options.forAddColumn) {
    parts.push("UNIQUE");
  }

  if (column.default !== undefined) {
    parts.push(`DEFAULT ${mapDefaultValue(column.default)}`);
  }

  if (column.references) {
    const [referencedTable, referencedColumn] = column.references.split(".");
    parts.push(
      `REFERENCES ${quoteIdentifier(referencedTable)}(${quoteIdentifier(referencedColumn)})`
    );
  }

  return parts.join(" ");
}

export function createCreateTableStatements(definition: SchemaDefinition = schema): string[] {
  return TABLE_ORDER.map((tableName) => {
    const table = definition[tableName];
    const columnStatements = Object.entries(table.columns).map(
      ([columnName, column]) => `  ${columnDefinitionSql(columnName, column)}`
    );

    return [
      `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (`,
      columnStatements.join(",\n"),
      ");"
    ].join("\n");
  });
}

export const createTableStatements = createCreateTableStatements();

/**
 * Secondary indexes. They used to live only in the hand-edited bootstrap SQL
 * file, so regenerating that file from schema.ts silently dropped them; keeping
 * them here makes `pnpm db:gen` reproduce src/db/bootstrap.sql exactly.
 */
/**
 * Indexes for the server-side inspection list (inspection-list-query.ts):
 * filter by discipline per ship, the open-comments queue, the planned-date
 * filter, and a covering index for the item -> current round lookup.
 * Databases created before them get them from migrate() (ensureIndexes).
 */
export const LIST_QUERY_ITEM_INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_inspection_items_ship_discipline ON "inspection_items"("shipId", "discipline");',
  'CREATE INDEX IF NOT EXISTS idx_inspection_items_open_comments ON "inspection_items"("shipId") WHERE "openCommentsCount" > 0;'
];
export const LIST_QUERY_ROUND_INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_inspection_rounds_plannedDate ON "inspection_rounds"("plannedDate");',
  'CREATE INDEX IF NOT EXISTS idx_inspection_rounds_item_round_cover ON "inspection_rounds"("inspectionItemId", "roundNumber", "plannedDate", "yardQc");'
];

const INDEX_GROUPS: ReadonlyArray<{ comment: string; statements: string[] }> = [
  {
    comment: "ships: 按项目查询船舶",
    statements: ['CREATE INDEX IF NOT EXISTS idx_ships_projectId ON "ships"("projectId");']
  },
  {
    comment: "inspection_items: 按船/专业/状态筛选检验项",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_inspection_items_shipId ON "inspection_items"("shipId");',
      'CREATE INDEX IF NOT EXISTS idx_inspection_items_discipline ON "inspection_items"("discipline");',
      'CREATE INDEX IF NOT EXISTS idx_inspection_items_workflowStatus ON "inspection_items"("workflowStatus");',
      ...LIST_QUERY_ITEM_INDEXES
    ]
  },
  {
    comment: "inspection_rounds: 按检验项加载轮次",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_inspection_rounds_inspectionItemId ON "inspection_rounds"("inspectionItemId");',
      'CREATE INDEX IF NOT EXISTS idx_inspection_rounds_item_round ON "inspection_rounds"("inspectionItemId", "roundNumber");',
      ...LIST_QUERY_ROUND_INDEXES
    ]
  },
  {
    comment: "comments: 按检验项加载意见 + 按状态统计",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_comments_inspectionItemId ON "comments"("inspectionItemId");',
      'CREATE INDEX IF NOT EXISTS idx_comments_status ON "comments"("inspectionItemId", "status");'
    ]
  },
  {
    comment: "observations: 按船+专业筛选意见",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_observations_shipId ON "observations"("shipId");',
      'CREATE INDEX IF NOT EXISTS idx_observations_ship_discipline ON "observations"("shipId", "discipline");'
    ]
  },
  {
    comment: "ncr_index: 按项目/船舶筛选 NCR",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_ncr_index_projectId ON "ncr_index"("projectId");',
      'CREATE INDEX IF NOT EXISTS idx_ncr_index_shipId ON "ncr_index"("shipId");'
    ]
  },
  {
    comment: "ncrs: 按船舶筛选 NCR（旧表）",
    statements: ['CREATE INDEX IF NOT EXISTS idx_ncrs_shipId ON "ncrs"("shipId");']
  },
  {
    comment: "fat_index: 按项目/船舶筛选 FAT",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_fat_index_projectId ON "fat_index"("projectId");',
      'CREATE INDEX IF NOT EXISTS idx_fat_index_shipId ON "fat_index"("shipId");'
    ]
  },
  {
    comment: "project_members: 按项目/用户查成员关系",
    statements: [
      'CREATE INDEX IF NOT EXISTS idx_project_members_projectId ON "project_members"("projectId");',
      'CREATE INDEX IF NOT EXISTS idx_project_members_userId ON "project_members"("userId");'
    ]
  }
];

export const createIndexStatements: string[] = INDEX_GROUPS.flatMap((group) => group.statements);

/** Every statement of the baseline schema, in execution order (all idempotent). */
export const schemaStatements: string[] = [...createTableStatements, ...createIndexStatements];

/** Full text of src/db/bootstrap.sql, as written by `pnpm db:gen`. */
export function renderBootstrapSql(): string {
  const indexSection = INDEX_GROUPS.map(
    (group) => [`-- ${group.comment}`, ...group.statements].join("\n")
  ).join("\n\n");

  return [
    createTableStatements.join("\n\n"),
    "",
    "-- ============================================================",
    "-- Performance Indexes",
    "-- ============================================================",
    "",
    indexSection,
    ""
  ].join("\n");
}
