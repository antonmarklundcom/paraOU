import { test, expect } from "@playwright/test";
import { categorySlug, departmentSlug } from "../src/lib/seo";

/**
 * Phase G acceptance (PLAN.md — free SEO landing pages + observatorio, never
 * gated): a category landing page renders pre-filtered results with no login, and
 * the observatorio stats page renders real aggregates. Fixture data comes from
 * `seedApiFixtures` (e2e/global-setup.ts).
 */
test("category landing page shows pre-filtered results, no login required", async ({ page }) => {
  const slug = categorySlug("42142500", "Medicamentos");
  await page.goto(`/licitaciones/categoria/${slug}`);
  await expect(
    page.getByRole("heading", { name: /Licitaciones de Medicamentos/i, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Adquisición de medicamentos esenciales")).toBeVisible();
  // Never gated: no sign-in prompt, no upgrade CTA on this page.
  await expect(page.getByRole("button", { name: "Ingresar" })).toHaveCount(0);
});

test("category x department combo page renders the intersection", async ({ page }) => {
  const slug = categorySlug("72141115", "Servicios de pavimentación");
  const deptSlug = departmentSlug("Alto Paraná");
  await page.goto(`/licitaciones/categoria/${slug}/${deptSlug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alto Paraná");
  await expect(page.getByText("Construcción de pavimento asfáltico")).toBeVisible();
});

test("observatorio page renders public aggregate stats with no login", async ({ page }) => {
  await page.goto("/observatorio");
  await expect(
    page.getByRole("heading", { name: "Observatorio de contrataciones públicas", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cierran pronto" })).toBeVisible();
  // t-004 (deadline +3d) is the seeded fixture that should show up as closing soon.
  await expect(page.getByText("Servicio de limpieza de oficinas")).toBeVisible();
});
