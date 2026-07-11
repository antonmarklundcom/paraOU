import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Next.js dev mode re-imports modules on every request,
 * so we cache the client on `globalThis` to avoid exhausting Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
