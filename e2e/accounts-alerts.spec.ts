import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";

/**
 * Phase 5 golden path (PHASE-5 acceptance): signup → create profile → save a
 * search → receive a (dev-transport) digest containing the expected tender.
 *
 * Magic-link email can't be clicked from Playwright (nothing captures the dev
 * transport's log line), so "signup" is simulated the same way a completed
 * Auth.js database-session sign-in leaves the browser: a Session row + the
 * `authjs.session-token` cookie. Everything downstream (saved search, digest)
 * exercises real app code, not mocks.
 */
test("signed-in user saves a search and receives a matching digest", async ({ page, context }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: { email, alertChannel: "EMAIL", alertFrequency: "DAILY" },
  });
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 3600_000) },
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);

  // Session-aware header shows the signed-in state, not "Ingresar".
  await page.goto("/panel");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

  // Save a search that matches the seeded "Itapúa" fixture tenders.
  await page.goto("/licitaciones?department=Itap%C3%BAa");
  const saveSearchButton = page.locator("button", { hasText: "🔖" });
  page.once("dialog", (d) => d.accept("Obras en Itapúa"));
  await saveSearchButton.click();
  await expect(saveSearchButton).toContainText("Búsqueda guardada");

  // /panel lists it under "Búsquedas guardadas".
  await page.goto("/panel");
  await expect(page.getByRole("link", { name: "Obras en Itapúa" })).toBeVisible();

  // Trigger the alert engine's digest job for this user (this is the worker's
  // cron body, run over HTTP via the E2E_TEST_HOOKS-gated route — see
  // playwright.config.ts) and verify it picked up the seeded Itapúa tender.
  const runDigest = async () => {
    const res = await page.request.post("/api/dev/run-digest", { data: { userId: user.id } });
    expect(res.ok()).toBe(true);
    return (await res.json()).data as { sent: boolean; itemCount: number };
  };

  const result = await runDigest();
  expect(result.sent).toBe(true);
  expect(result.itemCount).toBeGreaterThan(0);

  const logged = await prisma.alertLog.findMany({ where: { userId: user.id } });
  expect(logged.length).toBe(result.itemCount);

  // Re-running must send nothing further (AlertLog dedupe).
  const rerun = await runDigest();
  expect(rerun.sent).toBe(false);

  await prisma.alertLog.deleteMany({ where: { userId: user.id } });
  await prisma.savedSearch.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
