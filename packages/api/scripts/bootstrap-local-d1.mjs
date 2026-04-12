import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { rmSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const stateDir = resolve(packageDir, ".wrangler", "state");

console.log(`Cleaning up ${stateDir}...`);
rmSync(stateDir, { recursive: true, force: true });

const sqlFiles = [
  resolve(packageDir, "src", "db", "d1-bootstrap.sql"),
  resolve(packageDir, "scripts", "init-admin.sql"),
  resolve(packageDir, "scripts", "dummy-data.sql"),
  resolve(packageDir, "scripts", "dummy-data-2.sql")
];

for (const sqlFile of sqlFiles) {
  console.log(`Executing ${sqlFile}...`);
  const args = [
    "wrangler",
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

  try {
    const out = execFileSync("pnpm", ["exec", ...args], {
      cwd: packageDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: process.platform === "win32"
    });
    // process.stdout.write(out);
  } catch (e) {
    console.error(`Bootstrap failed for ${sqlFile}:`);
    if (e.stdout) console.error("STDOUT:", e.stdout);
    if (e.stderr) console.error("STDERR:", e.stderr);
    console.error("ERROR MESSAGE:", e.message);
    process.exit(1);
  }
}

