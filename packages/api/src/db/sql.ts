import { schema, type SchemaDefinition } from "./schema.ts";

const TABLE_ORDER = [
  "users",
  "projects",
  "ships",
  "inspectionItems",
  "inspectionRounds",
  "comments"
] as const satisfies ReadonlyArray<keyof SchemaDefinition>;

function quoteIdentifier(value: string): string {
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

export function createCreateTableStatements(definition: SchemaDefinition = schema): string[] {
  return TABLE_ORDER.map((tableName) => {
    const table = definition[tableName];
    const columnStatements = Object.entries(table.columns).map(([columnName, column]) => {
      const parts = [quoteIdentifier(columnName), mapColumnType(column.storage)];

      if (column.primaryKey) {
        parts.push("PRIMARY KEY");
      }

      if (!column.nullable && !column.primaryKey) {
        parts.push("NOT NULL");
      }

      if (column.unique) {
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

      return `  ${parts.join(" ")}`;
    });

    return [
      `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (`,
      columnStatements.join(",\n"),
      ");"
    ].join("\n");
  });
}

export const createTableStatements = createCreateTableStatements();
