import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { AccountForm } from "@/components/AccountForm";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const dynamic = "force-dynamic";

/** Basic account page (PHASE-5 step 6): locale, alert channel/frequency, delete
 * account. Requires sign-in. */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Mi cuenta</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>

      <Card className="mt-6 p-4">
        <AccountForm
          locale={user.locale}
          alertChannel={user.alertChannel}
          alertFrequency={user.alertFrequency}
        />
      </Card>

      <Card className="mt-6 border-status-closing/40 p-4">
        <h2 className="text-sm font-semibold text-status-closing">Zona de peligro</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Elimina tu cuenta, perfiles, matches y alertas de forma permanente.
        </p>
        <div className="mt-3">
          <DeleteAccountButton />
        </div>
      </Card>
    </main>
  );
}
