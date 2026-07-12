import { test, expect } from "@playwright/test";

/**
 * Phase 4 golden path: create a company profile in the wizard and land on the
 * panel. Runs WITHOUT live AI: when the provider is unavailable/out of quota the
 * wizard must still persist the profile and degrade gracefully (empty sample or
 * "IA no disponible" note), never block profile creation.
 */
test("profile wizard: 3 steps → sample screen → panel recognizes the profile", async ({ page }) => {
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Perfil de tu empresa" })).toBeVisible();

  // Step 1 — name + free-text description
  await page.getByPlaceholder("Nombre de la empresa").fill("Constructora E2E S.A.");
  await page
    .getByPlaceholder(/Somos una constructora/)
    .fill("Empresa constructora en Itapúa, obras viales y empedrados hasta Gs. 5.000 millones");
  await page.getByRole("button", { name: "Siguiente" }).click();

  // Step 2 — categories (pick nothing; AI suggest is optional and may be down)
  await expect(page.getByText("¿En qué rubros?")).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();

  // Step 3 — scope, then finish
  await expect(page.getByText("Alcance")).toBeVisible();
  await page.getByRole("button", { name: "Ver mis coincidencias" }).click();

  // Sample screen (step 4): profile saved; with AI down we accept the empty/degraded state.
  await expect(page.getByText("Tus primeras coincidencias")).toBeVisible();

  // Token persisted → /panel shows the feed shell, not the create-profile CTA.
  await page.getByRole("link", { name: "Ir a mi panel" }).click();
  await expect(page.getByRole("heading", { name: "Mi panel" })).toBeVisible();
  await expect(page.getByText("Editar perfil")).toBeVisible();
});

test("panel without a profile points to the wizard", async ({ page }) => {
  await page.goto("/panel");
  await expect(page.getByText("Todavía no creaste el perfil")).toBeVisible();
  await page.getByRole("link", { name: "Crear mi perfil" }).click();
  await expect(page).toHaveURL(/\/perfil/);
});
