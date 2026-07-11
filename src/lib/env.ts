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
