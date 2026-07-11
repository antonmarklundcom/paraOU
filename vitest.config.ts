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
    // Integration suites share one Postgres and each truncates/seeds in beforeAll,
    // so run test files serially to avoid cross-file DB races.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
