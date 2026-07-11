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
): Promise<T> {
  const hit = store.get(key);
  if (hit && now() < hit.expiresAt) return hit.value as T;
  const value = await produce();
  store.set(key, { value, expiresAt: now() + ttlMs });
  return value;
}

export function clearCache(): void {
  store.clear();
}
