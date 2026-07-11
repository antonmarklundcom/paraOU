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
