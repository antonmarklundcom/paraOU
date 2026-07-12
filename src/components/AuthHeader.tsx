"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { dict } from "@/lib/i18n";

/** Session-aware header widget (PHASE-5 #1: "Session-aware header"). */
export function AuthHeader() {
  const { data: session, status } = useSession();
  const t = dict().auth;

  if (status === "loading") return <span className="w-16" />;

  if (!session?.user) {
    return (
      <Link href="/login" className="hover:text-primary">
        {t.signIn}
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <Link href="/cuenta" className="hover:text-primary" title={session.user.email ?? ""}>
        {session.user.email?.split("@")[0]}
      </Link>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="text-muted-foreground hover:text-primary"
      >
        {t.signOut}
      </button>
    </span>
  );
}
