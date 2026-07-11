import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Prisma client and pino are server-only; keep them out of the client bundle.
  serverExternalPackages: ["@prisma/client", "pino", "pino-pretty"],
};

export default nextConfig;
