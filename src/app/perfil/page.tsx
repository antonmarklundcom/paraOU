import type { Metadata } from "next";
import { getFilterOptions } from "@/lib/api/meta";
import { dict } from "@/lib/i18n";
import { PerfilWizard } from "./PerfilWizard";

export const metadata: Metadata = {
  title: "Perfil de empresa",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const t = dict().perfil;
  const { categories, departments } = await getFilterOptions();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-muted-foreground">{t.subtitle}</p>
      <div className="mt-6">
        <PerfilWizard categories={categories} departments={departments} />
      </div>
    </main>
  );
}
