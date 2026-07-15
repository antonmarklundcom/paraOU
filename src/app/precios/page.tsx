import type { Metadata } from "next";
import type { Plan } from "@prisma/client";
import { auth } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { stripeConfigured } from "@/lib/env";
import { PricingCards } from "./PricingCards";

export const metadata: Metadata = {
  title: "Planes y precios",
  description: "Planes de ParaOU: gratis, Pro, Business y Agencia. Cancelá cuando quieras.",
  alternates: { canonical: "/precios" },
};
export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const t = dict().pricing;
  const session = await auth();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="mt-10">
        <PricingCards
          currentPlan={(session?.user?.plan as Plan | undefined) ?? null}
          stripeEnabled={stripeConfigured()}
        />
      </div>

      <p className="mt-8 text-center text-sm font-medium text-primary">{t.anchor}</p>

      <section className="mx-auto mt-16 max-w-2xl">
        <h2 className="text-xl font-semibold">{t.faqTitle}</h2>
        <div className="mt-4 space-y-4">
          {[
            [t.faq1q, t.faq1a],
            [t.faq2q, t.faq2a],
            [t.faq3q, t.faq3a],
          ].map(([q, a]) => (
            <div key={q}>
              <p className="font-medium">{q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
