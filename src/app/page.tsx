import Link from "next/link";
import { getHomeStats } from "@/lib/api/stats";
import { getFilterOptions } from "@/lib/api/meta";
import { dict } from "@/lib/i18n";
import { Card, Tag } from "@/components/ui";
import { formatGs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const t = dict();
  const [stats, options] = await Promise.all([getHomeStats(), getFilterOptions()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {t.landing.heroLead} <span className="text-primary">{t.landing.heroEmph}</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t.tagline}</p>
        <div className="mt-6">
          <Link
            href="/licitaciones"
            className="inline-block rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90"
          >
            {t.landing.browse}
          </Link>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-6 text-center">
          <div className="text-3xl font-bold text-status-open">{stats.openCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t.landing.openToday}</div>
        </Card>
        <Card className="p-6 text-center">
          <div className="text-3xl font-bold">{formatGs(stats.openValue)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t.landing.inPlay}</div>
        </Card>
      </section>

      {options.categories.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t.landing.topCategories}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.categories.slice(0, 12).map((c) => (
              <Link key={c.code} href={`/licitaciones?category=${encodeURIComponent(c.code)}`}>
                <Tag>
                  {c.name ?? c.code} · {c.count}
                </Tag>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
