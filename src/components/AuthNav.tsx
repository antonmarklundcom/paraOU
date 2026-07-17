import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

/** Session-aware nav item (PHASE-5 step 1): sign-in link, or email + sign-out. */
export async function AuthNav() {
  const session = await auth();
  if (!session?.user) {
    return (
      <Link href="/entrar" className="hover:text-primary">
        Iniciar sesión
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link href="/cuenta" className="hover:text-primary" title={session.user.email ?? undefined}>
        {session.user.email}
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="text-muted-foreground hover:text-primary">
          Salir
        </button>
      </form>
    </div>
  );
}
