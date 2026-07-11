import { test, expect } from "@playwright/test";

/** Golden path (PHASE-3 acceptance): browse → filter → open detail → download .ics. */
test("browse, filter, open a tender, download its .ics", async ({ page }) => {
  // Browse
  await page.goto("/licitaciones");
  await expect(page.getByRole("heading", { name: "Licitaciones", level: 1 })).toBeVisible();
  await expect(page.getByText("Adquisición de insumos médicos para hospitales")).toBeVisible();

  // Filter + sort via the URL-serialized state (shareable filters)
  await page.goto("/licitaciones?status=OPEN&sort=amount");
  const firstCardLink = page.locator("h3 a").first();
  await expect(firstCardLink).toHaveText(/medicamentos esenciales/i);

  // Open detail
  await firstCardLink.click();
  await expect(
    page.getByRole("heading", { name: /medicamentos esenciales/i, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Datos clave")).toBeVisible();

  // Download the calendar reminder
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Agendar cierre/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});

test("filters survive reload/share via the URL", async ({ page }) => {
  await page.goto("/licitaciones?status=OPEN&department=Central");
  // A matching tender (OPEN, Central) is shown; a non-matching one (Itapúa) is not.
  await expect(page.getByText("Servicio de limpieza de oficinas")).toBeVisible();
  await expect(page.getByText("medicamentos esenciales")).toHaveCount(0);
});
