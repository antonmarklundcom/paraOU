import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedApiFixtures } from "../src/lib/api/__tests__/seed";

/** Seed the deterministic fixture dataset before the e2e run, and clear
 * Phase-5 account/profile state so `auth.spec.ts` starts from a clean slate. */
export default async function globalSetup() {
  await prisma.alertLog.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.match.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.user.deleteMany();

  await seedApiFixtures(prisma);
  await prisma.$disconnect();
}
