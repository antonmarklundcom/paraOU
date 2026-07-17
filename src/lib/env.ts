import { z } from "zod";

/**
 * Central, validated view of the environment. Import `env` everywhere instead of
 * reading `process.env` directly so a missing/malformed variable fails loudly and
 * once, at startup, with a clear message.
 *
 * DNCP credentials are OPTIONAL: when they are absent the ingestion layer runs in
 * "fixtures mode" (no live API calls). See docs/01-dncp-api.md and PHASE-1.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // DNCP API (owner-provided). All optional so the app builds without secrets.
  DNCP_CONSUMER_KEY: z.string().optional(),
  DNCP_CONSUMER_SECRET: z.string().optional(),
  DNCP_REQUEST_TOKEN: z.string().optional(),
  DNCP_TOKEN_URL: z.string().url().default("https://contrataciones.gov.py/datos/api/oauth/token"),
  DNCP_INVALIDATE_URL: z
    .string()
    .url()
    .default("https://contrataciones.gov.py/datos/api/oauth/invalidate_token"),
  DNCP_API_BASE: z.string().url().default("https://contrataciones.gov.py/datos/api/v3"),

  // Rate limiter tunables (docs/01: stay well under 5,000 req / 15 min).
  DNCP_MAX_REQUESTS_PER_SECOND: z.coerce.number().positive().default(3),
  DNCP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().positive().default(3000),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // ── API layer (Phase 2) ────────────────────────────────────────────
  // Fallback PYG-per-USD rate used when the ExchangeRate table is empty
  // (docs/03: amounts stored in PYG; USD filter input is converted).
  DEFAULT_PYG_PER_USD: z.coerce.number().positive().default(7300),
  // Per-IP request budget for public API endpoints (protect the free tier).
  API_RATE_LIMIT_PER_MIN: z.coerce.number().positive().default(60),

  // ── AI matching (Phase 4, docs/04) ─────────────────────────────────
  // Google Gemini is the default provider (owner decision: cost). Anthropic is an
  // optional drop-in; both are OPTIONAL here so the app builds without secrets — see
  // dncpConfigured()'s sibling, aiConfigured() below, for the fixtures-mode gate.
  AI_PROVIDER: z.enum(["gemini", "anthropic"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // pgvector column is sized to this at migration time; changing it requires a new
  // migration + re-embedding everything (cheap, recomputable from Tender.raw).
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  // Model ids are env-overridable so a provider version bump is a config change, not
  // a code change. Defaults verified against live Gemini API docs on 2026-07-16
  // (Gemini 2.5 is GA-stable until 2026-10-16; migrate to Gemini 3 before then).
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  GEMINI_JUDGE_MODEL: z.string().default("gemini-2.5-flash-lite"),
  GEMINI_SUMMARY_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_API_BASE: z.string().url().default("https://generativelanguage.googleapis.com/v1beta"),
  // Hard daily spend cap (docs/04 cost guardrails): once today's ai_usage total
  // meets/exceeds this, stage 3 (LLM judge) and summaries pause until UTC midnight.
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
  // Shared-secret gate for /api/admin/*.
  ADMIN_TOKEN: z.string().optional(),

  // ── Accounts, saved searches, alerts (Phase 5, docs/05 §Alert emails) ───────
  // Auth.js requires AUTH_SECRET in production; optional here (dev falls back to a
  // fixed, clearly-labeled non-secret value) so the app still builds/runs without
  // it, per CLAUDE.md rule 2 — enforced for real at runtime in loadEnv() below.
  AUTH_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("ParaOU <alertas@paraou.example>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Where the dev email transport writes outgoing mail when RESEND_API_KEY is
  // absent (magic links + digests) — see src/lib/email/transport.ts.
  DEV_EMAIL_OUTBOX_PATH: z.string().default(".dev-outbox/emails.jsonl"),
  // Must be exactly "1" to enable GET /api/dev/last-email (dev/e2e only).
  DEV_EMAIL_OUTBOX_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.AUTH_SECRET) {
    // A warning, not a throw: `next build` always sets NODE_ENV=production even for
    // local/CI builds with no real secrets configured (CLAUDE.md rule 2 — build
    // against a dev fallback rather than blocking). Real deploys must set this.
    // eslint-disable-next-line no-console
    console.warn(
      "[env] AUTH_SECRET is not set. Falling back to a fixed, non-secret dev value — " +
        "sessions are NOT secure. Set AUTH_SECRET before serving real traffic " +
        "(openssl rand -base64 32).",
    );
  }
  return parsed.data;
}

export const env = loadEnv();

/** Non-secret placeholder used only when AUTH_SECRET is unset outside production
 * (local dev / CI). Never used when NODE_ENV=production — loadEnv() throws first. */
const DEV_AUTH_SECRET = "dev-only-insecure-auth-secret-do-not-use-in-production";

export function authSecret(): string {
  return env.AUTH_SECRET ?? DEV_AUTH_SECRET;
}

/**
 * True when all three DNCP secrets are present, i.e. the live API can be used.
 * When false, callers must fall back to fixtures.
 */
export function dncpConfigured(): boolean {
  return Boolean(env.DNCP_CONSUMER_KEY && env.DNCP_CONSUMER_SECRET && env.DNCP_REQUEST_TOKEN);
}

/**
 * True when the configured AI provider has a real API key. When false, the AI
 * layer runs on a deterministic mock provider (src/lib/ai/mock.ts) — no network
 * calls, no cost — so the matching pipeline is fully testable/demoable offline.
 */
export function aiConfigured(): boolean {
  if (env.AI_PROVIDER === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  return Boolean(env.GEMINI_API_KEY);
}

/** True when Resend is configured. When false, email goes to the local dev outbox
 * instead of being sent — see src/lib/email/transport.ts. */
export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** True when Google OAuth is configured; the sign-in page shows it only then. */
export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
