import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// NBINS_WEB_BASE sets the URL base the app is built for (e.g. /nbins/ behind
// nginx; `pnpm build:nbins` sets it). Default "/" keeps plain `pnpm build` as before.
export default defineConfig({
  base: process.env.NBINS_WEB_BASE || "/",
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": process.env.NBINS_API_PROXY_TARGET ?? "http://127.0.0.1:8787",
      "/health": process.env.NBINS_API_PROXY_TARGET ?? "http://127.0.0.1:8787"
    }
  },
  resolve: {
    alias: {
      "@nbins/shared": path.resolve(__dirname, "../shared/src/index.ts")
    }
  }
});
