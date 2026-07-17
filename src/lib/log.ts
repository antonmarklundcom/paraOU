import pino from "pino";
import { env } from "./env.js";

/**
 * Structured logger (docs/02: pino). In development we pretty-print; in
 * production we emit newline-delimited JSON for log shippers.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
});

export type Logger = typeof logger;

/**
 * Error-reporting entry point (docs/08 launch polish: optional Sentry hook).
 * Always logs via pino; additionally forwards to Sentry when SENTRY_DSN is set
 * AND the optional `@sentry/node` package has been installed (`npm i
 * @sentry/node`) — kept optional so the app never hard-depends on it.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  logger.error({ err, ...context }, err instanceof Error ? err.message : "unhandled error");
  if (!env.SENTRY_DSN) return;
  // Non-literal specifier: skips TS module resolution so this compiles whether
  // or not @sentry/node is installed (it's an optional dependency by design).
  const sentryModule = "@sentry/node";
  import(/* webpackIgnore: true */ sentryModule)
    .then((Sentry: { captureException: (err: unknown, ctx?: unknown) => void }) => {
      Sentry.captureException(err, context ? { extra: context } : undefined);
    })
    .catch(() => {
      // @sentry/node not installed — SENTRY_DSN is set but the hook is inert until it is.
    });
}
