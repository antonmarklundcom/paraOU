import { test, expect } from "@playwright/test";

/**
 * Golden path (PHASE-5 acceptance): signup via magic link → create profile → save
 * a search → receive a digest containing the expected tender. The magic-link email
 * is read from the dev outbox (DEV_EMAIL_OUTBOX_ENABLED=1, set for the e2e
 * webServer only — see playwright.config.ts) instead of a real inbox.
 */
test("signup, create profile, save search, receive digest", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // 1. Request a magic link.
  await page.goto("/entrar");
  await page.getByPlaceholder("tu@empresa.com").fill(email);
  await page.getByRole("button", { name: "Enviarme un enlace" }).click();
  // Let the form's own navigation (to Auth.js's "check your email" page) settle
  // before we programmatically navigate again — otherwise the two races.
  await page.waitForURL(/verify-request/);

  // 2. "Open the inbox": read the dev outbox instead of a real email client.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`);
        return res.status();
      },
      { timeout: 10_000 },
    )
    .toBe(200);

  const emailRes = await page.request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`);
  const { data } = await emailRes.json();
  const magicLink = /href="([^"]+)"/.exec(data.html)?.[1];
  expect(magicLink).toBeTruthy();

  // 3. Click it — this signs the browser in.
  await page.goto(magicLink!);
  await expect(page).toHaveURL(/\/panel$/);

  // 4. Create a company profile.
  await page.goto("/perfil");
  await page.getByPlaceholder("Constructora del Este S.A.").fill("E2E Insumos SA");
  await page
    .getByPlaceholder(/empresa constructora en Itapúa/)
    .fill("Empresa proveedora de insumos médicos y jeringas para hospitales.");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Ver mis matches" }).click();
  await expect(page.getByRole("heading", { name: /Estos son tus primeros matches/ })).toBeVisible();

  // 5. Save a search from the overview page.
  await page.goto("/licitaciones?status=OPEN");
  page.once("dialog", (dialog) => dialog.accept("Mis abiertas"));
  await page.getByRole("button", { name: /Guardar búsqueda/ }).click();
  await expect(page.getByRole("button", { name: "✓ Guardada" })).toBeVisible();

  const searches = await page.request.get("/api/saved-searches");
  expect((await searches.json()).data).toHaveLength(1);

  // 6. Trigger the alert engine (dev-only endpoint — the real path is the worker
  // cron) and confirm exactly one digest was sent, containing an expected tender.
  const run = await page.request.post("/api/dev/run-alerts");
  expect(run.ok()).toBeTruthy();
  const runJson = await run.json();
  expect(runJson.data.digestsSent).toBe(1);

  const digestRes = await page.request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`);
  const digest = (await digestRes.json()).data;
  expect(digest.subject).toContain("E2E Insumos SA");
  expect(digest.html).toMatch(/href="https?:\/\/[^"]+\/licitaciones\/[^"]+"/);
  expect(digest.headers["List-Unsubscribe"]).toBeTruthy();

  // 7. Re-running sends nothing (AlertLog dedupe).
  const rerun = await page.request.post("/api/dev/run-alerts");
  expect((await rerun.json()).data.digestsSent).toBe(0);
});
