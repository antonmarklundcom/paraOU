import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);

// Use the environment's preinstalled Chromium when present (its revision may differ
// from what this Playwright version would download); CI installs its own.
const PREINSTALLED = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PREINSTALLED) ? PREINSTALLED : undefined;

/** E2E config (PHASE-3 golden path). Seeds the DB in globalSetup, then starts the
 * production server. Uses the environment's preinstalled Chromium
 * (PLAYWRIGHT_BROWSERS_PATH) — do not run `playwright install` in this repo's dev env. */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // e2e-only: lets the auth.spec golden path read the magic-link email via
      // GET /api/dev/last-email (never enabled in a real deploy — see .env.example).
      DEV_EMAIL_OUTBOX_ENABLED: "1",
      DEV_EMAIL_OUTBOX_PATH: ".dev-outbox/e2e-emails.jsonl",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
});
