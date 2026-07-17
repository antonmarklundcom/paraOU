import { signIn } from "@/lib/auth";
import { googleConfigured } from "@/lib/env";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

async function signInWithEmail(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  await signIn("email", { email, redirectTo: "/panel" });
}

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/panel" });
}

/** Magic-link (primary) + Google (optional) sign-in (PHASE-5 step 1). */
export default function SignInPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Te enviamos un enlace mágico por email — sin contraseña.
      </p>

      <Card className="mt-6 p-4">
        <form action={signInWithEmail} className="space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="tu@empresa.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Enviarme un enlace
          </button>
        </form>

        {googleConfigured() && (
          <>
            <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
            </div>
            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="w-full rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                Continuar con Google
              </button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
