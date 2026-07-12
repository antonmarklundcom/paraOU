import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { AccountForm } from "./AccountForm";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = dict().cuenta;
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <div className="mt-6">
        <AccountForm />
      </div>
    </main>
  );
}
