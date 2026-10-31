// Regenerates src/db/bootstrap.sql (tables + indexes) from src/db/schema.ts / sql.ts.
// Usage: pnpm db:gen            (writes src/db/bootstrap.sql)
//        pnpm --filter @nbins/api run gen:bootstrap-sql -- <output-path>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBootstrapSql } from "../src/db/sql.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const outputPathArg = process.argv.slice(2).find((value) => value !== "--") ?? "src/db/bootstrap.sql";
const outputPath = resolve(packageDir, outputPathArg);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, renderBootstrapSql(), "utf8");

console.log(outputPath);
