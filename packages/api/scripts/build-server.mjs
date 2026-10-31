// Bundles the Node server and the maintenance CLI into dist/ (pnpm build).
//   dist/server.mjs  -> pnpm start / systemd
//   dist/cli.mjs     -> node dist/cli.mjs backup|migrate|check|import-d1 ...
// Dependencies (hono, @hono/node-server, @nbins/shared) are bundled in, so the
// output runs on plain Node >= 22.13 without TypeScript type stripping.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: packageDir,
  entryPoints: { server: "src/server.ts", cli: "src/cli.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["node:*"],
  banner: {
    // Some bundled CommonJS dependencies call require(); give ESM output one.
    js: "import { createRequire as __nbinsCreateRequire } from 'node:module'; const require = __nbinsCreateRequire(import.meta.url);"
  },
  logLevel: "info"
});
