import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const stateDir = resolve(packageDir, "..", "..", ".wrangler", "state");
const sqlFile = resolve(packageDir, "src", "db", "d1-bootstrap.sql");

const args = [
  "d1",
  "execute",
  "DB",
  "--local",
  "--persist-to",
  stateDir,
  "--file",
  sqlFile,
  "--json"
];

const out = execFileSync("wrangler", args, {
  cwd: packageDir,
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8"
});

process.stdout.write(out);
