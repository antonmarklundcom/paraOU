/** Helpers to build shareable `/licitaciones` URLs from the current filter state.
 * Filter changes always reset the pagination cursor. */

export type RawParams = Record<string, string | string[] | undefined>;

function normalize(params: RawParams): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "cursor" || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => x !== "" && usp.append(k, x));
    else if (v !== "") usp.append(k, v);
  }
  usp.sort();
  return usp;
}

export function serialize(params: RawParams): string {
  const s = normalize(params).toString();
  return s ? `?${s}` : "";
}

/** Replace a single-valued param (empty clears it). */
export function setParam(params: RawParams, key: string, value: string): string {
  const next = { ...params };
  if (value === "") delete next[key];
  else next[key] = value;
  return serialize(next);
}

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? [...v] : [v];
}

/** Toggle a value in a multi-valued param (checkbox-style filter). */
export function toggleParam(params: RawParams, key: string, value: string): string {
  const arr = asArray(params[key]);
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(value);
  return serialize({ ...params, [key]: arr });
}

/** Remove one specific value from a param (chip removal); clears single values too. */
export function removeValue(params: RawParams, key: string, value: string): string {
  const arr = asArray(params[key]).filter((v) => v !== value);
  return serialize({ ...params, [key]: arr });
}
