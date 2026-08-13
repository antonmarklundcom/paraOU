import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";

/**
 * Phase F2 golden path: a BUSINESS account creates a second company profile
 * from the /panel + /perfil switcher, and each profile sees its own match
 * feed (never the other profile's).
 */
test("multi-profile switcher: create second profile → switch → separate match feeds", async ({
  page,
  context,
}) => {
  const email = `e2e-f2-${randomUUID()}@example.com`;
  const user = await prisma.user.create({ data: { email, plan: "BUSINESS" } });
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

  const profileA = await prisma.companyProfile.create({
    data: {
      userId: user.id,
      name: "Constructora del Este",
      description: "Obras viales en Alto Paraná, primer perfil de la cuenta",
    },
  });
  const tenderA = await prisma.tender.create({
    data: {
      ocid: `f2-switcher-a-${randomUUID()}`,
      title: "Empedrado de calles en Ciudad del Este",
      status: "OPEN",
      currency: "PYG",
      raw: {},
    },
  });
  await prisma.match.create({
    data: {
      profileId: profileA.id,
      tenderId: tenderA.id,
      score: 85,
      verdict: "STRONG",
      fitReasons: [],
      cautions: [],
      profileVersion: 1,
      tenderVersion: 1,
    },
  });

  // Profile A's feed shows its own match.
  await page.goto("/panel");
  await expect(page.getByText("Empedrado de calles en Ciudad del Este")).toBeVisible();

  // Open the switcher and create a second profile.
  await page.getByRole("button", { name: /Perfil de empresa/ }).click();
  await page.getByRole("button", { name: "+ Nuevo perfil" }).click();
  await expect(page).toHaveURL(/\/perfil\?new=1/);

  await page.getByPlaceholder("Nombre de la empresa").fill("Consultora del Norte");
  await page
    .getByPlaceholder(/Somos una constructora/)
    .fill("Segundo perfil: consultoría técnica para licitaciones en Concepción");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("¿En qué rubros?")).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Alcance")).toBeVisible();
  await page.getByRole("button", { name: "Ver mis coincidencias" }).click();
  await expect(page.getByText("Tus primeras coincidencias")).toBeVisible();

  const profileB = await prisma.companyProfile.findFirstOrThrow({
    where: { userId: user.id, name: "Consultora del Norte" },
  });
  const tenderB = await prisma.tender.create({
    data: {
      ocid: `f2-switcher-b-${randomUUID()}`,
      title: "Consultoría técnica en Concepción",
      status: "OPEN",
      currency: "PYG",
      raw: {},
    },
  });
  await prisma.match.create({
    data: {
      profileId: profileB.id,
      tenderId: tenderB.id,
      score: 90,
      verdict: "STRONG",
      fitReasons: [],
      cautions: [],
      profileVersion: 1,
      tenderVersion: 1,
    },
  });

  // Landing on /panel now (profile B is active): sees only B's match.
  await page.getByRole("link", { name: "Ir a mi panel" }).click();
  await expect(page.getByText("Consultoría técnica en Concepción")).toBeVisible();
  await expect(page.getByText("Empedrado de calles en Ciudad del Este")).not.toBeVisible();

  // Switch back to profile A: its feed reappears, B's disappears.
  await page.getByRole("button", { name: /Perfil de empresa/ }).click();
  await page.getByRole("button", { name: "Constructora del Este" }).click();
  await expect(page.getByText("Empedrado de calles en Ciudad del Este")).toBeVisible();
  await expect(page.getByText("Consultoría técnica en Concepción")).not.toBeVisible();

  await prisma.match.deleteMany({ where: { profileId: { in: [profileA.id, profileB.id] } } });
  await prisma.companyProfile.deleteMany({ where: { userId: user.id } });
  await prisma.tender.deleteMany({ where: { id: { in: [tenderA.id, tenderB.id] } } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
