"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { PRICING } from "@/lib/plan";

type Cycle = "monthly" | "annual";
type CurrentPlan = "FREE" | "PRO" | "BUSINESS" | "AGENCY" | null;

/** Tier table + Stripe Checkout kickoff (PHASE-6 #3). */
export function PricingCards({
  currentPlan,
  stripeEnabled,
}: {
  currentPlan: CurrentPlan;
  stripeEnabled: boolean;
}) {
  const { status } = useSession();
  const t = dict().pricing;
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: "PRO" | "BUSINESS") {
    setError(null);
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, cycle }),
      });
      if (!res.ok) {
        setError(t.checkoutError);
        return;
      }
      const { data } = await res.json();
      window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  const btn = "w-full rounded-md px-4 py-2 text-sm font-semibold";
  const primaryBtn = cn(btn, "bg-primary text-primary-foreground hover:opacity-90");
  const ghostBtn = cn(btn, "border border-border hover:bg-accent");

  const tiers: {
    key: "FREE" | "PRO" | "BUSINESS" | "AGENCY";
    label: string;
    desc: string;
    price: string;
    billable: boolean;
  }[] = [
    { key: "FREE", label: PRICING.FREE.label, desc: t.freeDesc, price: "$0", billable: false },
    {
      key: "PRO",
      label: PRICING.PRO.label,
      desc: t.proDesc,
      price: `$${PRICING.PRO.usdMin}–${PRICING.PRO.usdMax}`,
      billable: true,
    },
    {
      key: "BUSINESS",
      label: PRICING.BUSINESS.label,
      desc: t.businessDesc,
      price: `$${PRICING.BUSINESS.usdMin}–${PRICING.BUSINESS.usdMax}`,
      billable: true,
    },
    {
      key: "AGENCY",
      label: PRICING.AGENCY.label,
      desc: t.agencyDesc,
      price: `$${PRICING.AGENCY.usdMin}+`,
      billable: false,
    },
  ];

  return (
    <div>
      <div className="flex justify-center gap-2">
        {(["monthly", "annual"] as Cycle[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCycle(c)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm",
              cycle === c
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {c === "monthly" ? t.monthly : t.annual}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-center text-sm text-status-closed">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <Card key={tier.key} className="flex flex-col p-6">
            <h3 className="text-lg font-semibold">{tier.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tier.desc}</p>
            <p className="mt-4 text-2xl font-bold">
              {tier.price}
              {tier.billable && <span className="text-sm font-normal">{t.perMonth}</span>}
            </p>
            <div className="mt-6 flex-1" />
            {currentPlan === tier.key ? (
              <p className="text-center text-sm font-medium text-status-open">{t.currentPlan}</p>
            ) : tier.billable ? (
              status !== "authenticated" ? (
                <Link href="/login" className={ghostBtn}>
                  {t.signInToSubscribe}
                </Link>
              ) : !stripeEnabled ? (
                <a href="mailto:hola@paraou.com" className={ghostBtn}>
                  {t.contactUs}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={loading === tier.key}
                  onClick={() => void subscribe(tier.key as "PRO" | "BUSINESS")}
                  className={primaryBtn}
                >
                  {t.subscribe}
                </button>
              )
            ) : tier.key === "AGENCY" ? (
              <a href="mailto:hola@paraou.com" className={ghostBtn}>
                {t.contactUs}
              </a>
            ) : (
              <Link href="/perfil" className={ghostBtn}>
                {t.subscribe}
              </Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
