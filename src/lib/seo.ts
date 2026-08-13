/**
 * URL slug helpers for the SEO landing pages (PLAN.md Phase G). Category and
 * department taxonomy already lives in `getFilterOptions()` (src/lib/api/meta.ts)
 * — these helpers just turn that data into stable, keyword-rich URLs and back.
 *
 * Category slugs embed the DNCP category code (stable, unique) after a
 * human-readable, keyword-rich prefix (`--code` suffix) so lookups never depend on
 * fuzzy name matching, even though categoryName can be null or shift over time.
 * Department slugs are plain accent-stripped names — matched back against the live
 * department list, since Paraguay's ~18 departments are a small, stable set.
 */

/** Lowercase, accent-stripped, hyphenated slug fragment. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build the `/licitaciones/categoria/[slug]` slug for a category. */
export function categorySlug(code: string, name: string | null): string {
  const base = slugify(name && name.trim() ? name : code) || "categoria";
  return `${base}--${code}`;
}

/** Recover the DNCP category code from a category slug (trailing `--code`). */
export function parseCategorySlug(slug: string): string | null {
  const m = /--([A-Za-z0-9]+)$/.exec(slug);
  return m?.[1] ?? null;
}

/** Build the `/licitaciones/departamento/[slug]` slug for a department name. */
export function departmentSlug(name: string): string {
  return slugify(name);
}

/** Find the department name (as stored on Tender) matching a department slug. */
export function findDepartmentBySlug(
  departments: { value: string }[],
  slug: string,
): string | null {
  const match = departments.find((d) => departmentSlug(d.value) === slug);
  return match ? match.value : null;
}

/** Find the category {code, name} matching a category slug. */
export function findCategoryBySlug(
  categories: { code: string; name: string | null }[],
  slug: string,
): { code: string; name: string | null } | null {
  const code = parseCategorySlug(slug);
  if (!code) return null;
  return categories.find((c) => c.code === code) ?? null;
}
