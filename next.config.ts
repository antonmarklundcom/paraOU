import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Prisma client and pino are server-only; keep them out of the client bundle.
  serverExternalPackages: ["@prisma/client", "pino", "pino-pretty"],
  // The codebase uses NodeNext-style ".js" import specifiers (resolved by tsx/tsc);
  // teach webpack to resolve them to the ".ts" sources so route → lib imports build.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
