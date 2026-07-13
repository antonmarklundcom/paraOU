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
    // Vitest applies `env` before a test file's own module graph loads, unlike a
    // top-of-file `process.env.X ??=` (import statements are hoisted above it, so
    // env.ts — imported transitively — would already have cached X as unset). CI has
    // no real Gemini key; recorded-response tests only need a non-empty string to
    // pass env validation, since the fake fetch never sends it anywhere.
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || "test-key",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_dummy",
      STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL || "price_pro_annual",
      STRIPE_PRICE_BUSINESS_MONTHLY:
        process.env.STRIPE_PRICE_BUSINESS_MONTHLY || "price_business_monthly",
      STRIPE_PRICE_BUSINESS_ANNUAL:
        process.env.STRIPE_PRICE_BUSINESS_ANNUAL || "price_business_annual",
    },
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
