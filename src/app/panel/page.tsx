import Link from "next/link";
import { readAnonId } from "@/lib/anon";
import { getProfileByAnonId } from "@/lib/api/profile";
import { getFeed, type FeedTender } from "@/lib/api/matches";
import { Card } from "@/components/ui";
import { formatDate, deadlinePhrase } from "@/lib/format";

export const dynamic = "force-dynamic";

function FeedRow({ tender }: { tender: FeedTender }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/licitaciones/${encodeURIComponent(tender.ocid)}`}
          className="font-semibold hover:underline"
        >
          {tender.title}
        </Link>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {tender.score}%
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {[tender.buyerName, tender.department].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2 text-sm">{tender.reasoning}</p>
      {tender.deadlineAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          {deadlinePhrase(tender.daysUntilDeadline)} · {formatDate(tender.deadlineAt)}
        </p>
      )}
    </Card>
  );
}

function Section({ title, items }: { title: string; items: FeedTender[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3">
        {items.map((t) => (
          <FeedRow key={t.ocid} tender={t} />
        ))}
      </div>
    </section>
  );
}

/** /panel — logged-in-style dashboard (docs/05 §3), driven by the anon profile
 * cookie until Phase 5 wires real accounts. */
export default async function PanelPage() {
  const anonId = await readAnonId();
  const profile = anonId ? await getProfileByAnonId(anonId) : null;

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="text-2xl font-bold">Todavía no tenés un perfil</h1>
        <p className="mt-2 text-muted-foreground">
          Creá tu perfil de empresa para ver licitaciones filtradas y explicadas para vos.
        </p>
        <Link
          href="/perfil"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Crear perfil
        </Link>
      </main>
    );
  }

  const feed = await getFeed(profile.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tu feed</h1>
        <Link href="/perfil" className="text-sm text-primary hover:underline">
          Editar perfil
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{profile.name}</p>

      {feed.total === 0 ? (
        <Card className="mt-6 p-6 text-center text-muted-foreground">
          Todavía no hay licitaciones que coincidan con tu perfil. Volvé pronto — el feed se
          actualiza con cada sincronización.
        </Card>
      ) : (
        <>
          <Section title="Nuevos" items={feed.nuevos} />
          <Section title="Cierran pronto" items={feed.cierranPronto} />
          <Section title="Guardados" items={feed.guardados} />
        </>
      )}
    </main>
  );
}
