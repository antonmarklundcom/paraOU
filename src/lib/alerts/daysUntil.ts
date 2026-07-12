/** Same logic as the private helper in api/tenders.ts — kept in sync manually
 * since it's a two-line pure function used from both an API and a worker module. */
export function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
