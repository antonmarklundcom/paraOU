import { test, expect } from "@playwright/test";

/**
 * Phase 6 golden path (PHASE-6 acceptance: "FREE user hitting a gate sees a
 * contextual upgrade prompt, not a dead end"). Runs without a real Stripe
 * account — the pricing page must still render and the CTA must not be a
 * broken link.
 */
test("pricing page renders all four tiers with a subscribe/contact CTA", async ({ page }) => {
  await page.goto("/precios");
  await expect(page.getByRole("heading", { name: "Planes", level: 1 })).toBeVisible();

  for (const label of ["Gratis", "Pro", "Business", "Agencia / API"]) {
    await expect(page.getByRole("heading", { name: label, level: 3 })).toBeVisible();
  }

  // Anonymous visitor: PRO/BUSINESS subscribe CTAs point at sign-in, not Stripe
  // directly (Stripe isn't configured in this environment either way).
  const signInLinks = page.getByRole("link", { name: "Ingresá para suscribirte" });
  await expect(signInLinks).toHaveCount(2);
});

test("nav links to /precios from the main site", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Planes" }).click();
  await expect(page).toHaveURL(/\/precios/);
});
