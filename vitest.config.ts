import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Node environment for unit + integration tests (no jsdom needed in Phase 1).
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: true,
    // Load .env before test modules import (env.ts validates at import time).
    setupFiles: ["dotenv/config"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
