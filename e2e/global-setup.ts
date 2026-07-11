import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedApiFixtures } from "../src/lib/api/__tests__/seed";

/** Seed the deterministic fixture dataset before the e2e run. */
export default async function globalSetup() {
  await seedApiFixtures(prisma);
  await prisma.$disconnect();
}
