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

  // ── AI (Phase 4) ───────────────────────────────────────────────────
  // Gemini is the default provider (docs/04, owner decision). Keys optional so the
  // app builds without secrets; when the active provider's key is missing, AI
  // features run in "unconfigured" mode and jobs skip loudly instead of crashing.
  AI_PROVIDER: z.enum(["gemini", "anthropic"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // pgvector column dimension. Changing it requires a migration + re-embedding
  // (docs/04) — embeddings are recomputable from Tender.raw.
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  // Daily AI spend ceiling (docs/04 kill switch). Summed from AiUsage.estCostUsd
  // over the current America/Asuncion day.
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
  // Model ids are env-overridable: verified live 2026-07, but Google rotates
  // families fast (Gemini 3.x already stable) — upgrade via env, not code.
  GEMINI_MODEL_JUDGE: z.string().default("gemini-2.5-flash-lite"),
  GEMINI_MODEL_SUMMARY: z.string().default("gemini-2.5-flash"),
  GEMINI_MODEL_ANALYSIS: z.string().default("gemini-2.5-pro"),
  GEMINI_MODEL_EMBEDDING: z.string().default("gemini-embedding-001"),
  // Gate for /admin/ai (Phase 4). Page 404s unless this is set and matches the
  // ?key= query param. Replaced by proper roles in Phase 5.
  ADMIN_KEY: z.string().optional(),

  // ── Auth & email (Phase 5) ──────────────────────────────────────────
  // Auth.js session/CSRF secret. Optional so the app builds without it; auth
  // routes throw a clear error if actually invoked while unset (see auth.ts).
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Resend transactional email (magic links + digests). Missing key => dev
  // transport (logs the email instead of sending — CLAUDE.md rule 2).
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("ParaOU <onboarding@resend.dev>"),
  // Alert engine (worker job after each sync + matching run).
  ALERT_MIN_MATCH_SCORE: z.coerce.number().int().min(0).max(100).default(70),
  ALERT_DIGEST_MAX_ITEMS: z.coerce.number().int().positive().default(10),
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
  return parsed.data;
}

export const env = loadEnv();

/**
 * True when all three DNCP secrets are present, i.e. the live API can be used.
 * When false, callers must fall back to fixtures.
 */
export function dncpConfigured(): boolean {
  return Boolean(env.DNCP_CONSUMER_KEY && env.DNCP_CONSUMER_SECRET && env.DNCP_REQUEST_TOKEN);
}

/**
 * True when the active AI provider has its API key. When false, AI jobs
 * (embeddings, matching, summaries) skip with a warning instead of crashing —
 * same convention as `dncpConfigured`.
 */
export function aiConfigured(): boolean {
  return env.AI_PROVIDER === "gemini"
    ? Boolean(env.GEMINI_API_KEY)
    : Boolean(env.ANTHROPIC_API_KEY);
}

/** True when Resend is configured; false => dev transport (console log). */
export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** True when Google OAuth creds are present (optional per docs/05). */
export function googleAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
