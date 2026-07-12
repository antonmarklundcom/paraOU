"use client";

import { SessionProvider } from "next-auth/react";

/** Wraps the app so client components can use `useSession()` (Phase 5). */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
