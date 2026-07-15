import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
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
