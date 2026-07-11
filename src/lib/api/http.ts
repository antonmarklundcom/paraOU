import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output } from "zod";

/**
 * Consistent JSON envelope + error handling for all Phase 2 route handlers.
 *
 * Success: { ok: true, data }
 * Failure: { ok: false, error: { code, message, details? } }
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * Wrap a route handler so thrown ZodErrors become 400s, ApiErrors map to their
 * status, and anything else becomes a 500 without leaking internals.
 */
export function handle<P extends Record<string, string> = Record<string, string>>(
  fn: (req: Request, ctx: { params: Promise<P> }) => Promise<NextResponse>,
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(400, "VALIDATION", "Invalid request parameters", err.flatten());
      }
      if (err instanceof ApiError) {
        return fail(err.status, err.code, err.message, err.details);
      }
      // Unknown error: log server-side, return a generic message.
      console.error("Unhandled API error:", err);
      return fail(500, "INTERNAL", "Internal server error");
    }
  };
}

/**
 * Collapse Next.js URLSearchParams into a plain object where repeated keys (and the
 * `key[]` convention) become arrays. Feed the result to a zod schema.
 */
export function searchParamsToObject(url: string): Record<string, string | string[]> {
  const params = new URL(url).searchParams;
  const out: Record<string, string | string[]> = {};
  for (const rawKey of new Set(params.keys())) {
    const key = rawKey.endsWith("[]") ? rawKey.slice(0, -2) : rawKey;
    const values = params.getAll(rawKey);
    if (rawKey.endsWith("[]") || values.length > 1) {
      out[key] = [...(Array.isArray(out[key]) ? (out[key] as string[]) : []), ...values];
    } else {
      out[key] = values[0]!;
    }
  }
  return out;
}

export function parseQuery<S extends ZodTypeAny>(url: string, schema: S): output<S> {
  return schema.parse(searchParamsToObject(url));
}
