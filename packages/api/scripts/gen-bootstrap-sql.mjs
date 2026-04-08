import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTableStatements } from "../src/db/sql.ts";

const outputPathArg = process.argv.slice(2).find((value) => value !== "--");

if (!outputPathArg) {
  console.error("Usage: pnpm --filter @nbins/api run gen:bootstrap-sql -- <output-path>");
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const outputPath = resolve(packageDir, outputPathArg);
const sql = `${createTableStatements.join("\n\n")}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, "utf8");

console.log(outputPath);
