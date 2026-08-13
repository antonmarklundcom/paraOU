/**
 * Tiny in-memory TTL cache for aggregate endpoints (buyer/supplier profiles, filter
 * option lists) — "cached 1h" in PHASE-2. Single-process (docs/02: no Redis in v1).
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
  now: () => number = Date.now,
  options?: { isEmpty?: (value: T) => boolean },
): Promise<T> {
  const hit = store.get(key);
  if (hit && now() < hit.expiresAt && !options?.isEmpty?.(hit.value as T)) {
    return hit.value as T;
  }
  const value = await produce();
  // Don't trust an "empty" result for the full TTL — it usually means the DB
  // hasn't been seeded/synced yet (e.g. a cold deploy, or a health-check probe
  // that lands before the first ingest), not that there's genuinely nothing to
  // show. Caching it anyway would make real data invisible for up to `ttlMs`.
  if (!options?.isEmpty?.(value)) store.set(key, { value, expiresAt: now() + ttlMs });
  return value;
}

export function clearCache(): void {
  store.clear();
}
