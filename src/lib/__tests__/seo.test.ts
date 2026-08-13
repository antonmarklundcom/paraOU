import { describe, it, expect } from "vitest";
import {
  slugify,
  categorySlug,
  parseCategorySlug,
  departmentSlug,
  findDepartmentBySlug,
  findCategoryBySlug,
} from "../seo.js";

describe("slugify", () => {
  it("strips accents and lowercases", () => {
    expect(slugify("Alto Paraná")).toBe("alto-parana");
    expect(slugify("Ñeembucú")).toBe("neembucu");
  });
  it("collapses non-alphanumerics to single hyphens and trims edges", () => {
    expect(slugify("Servicios de pavimentación / asfalto")).toBe(
      "servicios-de-pavimentacion-asfalto",
    );
    expect(slugify("  --Útiles escolares--  ")).toBe("utiles-escolares");
  });
});

describe("categorySlug / parseCategorySlug", () => {
  it("embeds the category code so lookups don't depend on fuzzy name matching", () => {
    const slug = categorySlug("42142523", "Jeringas hipodérmicas");
    expect(slug).toBe("jeringas-hipodermicas--42142523");
    expect(parseCategorySlug(slug)).toBe("42142523");
  });
  it("falls back to the code as the readable part when name is null", () => {
    const slug = categorySlug("99999999", null);
    expect(slug).toBe("99999999--99999999");
    expect(parseCategorySlug(slug)).toBe("99999999");
  });
  it("returns null for a slug with no embedded code", () => {
    expect(parseCategorySlug("not-a-category-slug")).toBeNull();
  });
});

describe("departmentSlug / findDepartmentBySlug", () => {
  const departments = [{ value: "Alto Paraná" }, { value: "Itapúa" }, { value: "Central" }];
  it("round-trips a department name through its slug", () => {
    expect(departmentSlug("Alto Paraná")).toBe("alto-parana");
    expect(findDepartmentBySlug(departments, "alto-parana")).toBe("Alto Paraná");
  });
  it("returns null for an unknown slug", () => {
    expect(findDepartmentBySlug(departments, "nowhere")).toBeNull();
  });
});

describe("findCategoryBySlug", () => {
  const categories = [
    { code: "42142523", name: "Jeringas hipodérmicas" },
    { code: "44121700", name: "Útiles escolares" },
  ];
  it("finds a category by its slug's embedded code", () => {
    const slug = categorySlug("44121700", "Útiles escolares");
    expect(findCategoryBySlug(categories, slug)).toEqual({
      code: "44121700",
      name: "Útiles escolares",
    });
  });
  it("returns null when the code isn't in the known list", () => {
    expect(findCategoryBySlug(categories, categorySlug("00000000", "Otro"))).toBeNull();
  });
});
