import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { asuncionDayStart, todaySpendUsd } from "@/lib/ai/usage";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Admin · IA", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Env-gated AI cost/quality dashboard (PHASE-4 deliverable 6). 404s unless
 * ADMIN_KEY is set and matches ?key= — replaced by proper roles in Phase 5.
 * Spanish-first exemption: admin-only page, owner-facing.
 */
export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) notFound();

  const dayStart = asuncionDayStart();
  const [spendToday, byPurpose, last14d, recentMatches, feedback] = await Promise.all([
    todaySpendUsd(),
    prisma.aiUsage.groupBy({
      by: ["purpose", "model"],
      _sum: { estCostUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
      where: { createdAt: { gte: dayStart } },
    }),
    prisma.$queryRaw<{ day: Date; cost: number; calls: number }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'America/Asuncion') AS day,
             sum("estCostUsd")::float AS cost, count(*)::int AS calls
      FROM "AiUsage" WHERE "createdAt" > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1 DESC
    `,
    prisma.match.findMany({
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: {
        tender: { select: { title: true, ocid: true } },
        profile: { select: { name: true } },
      },
    }),
    prisma.aiFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const budget = env.AI_DAILY_BUDGET_USD;
  const killSwitchOn = spendToday >= budget;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">AI — costos y calidad</h1>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Hoy (America/Asuncion)</h2>
        <p className="mt-2 text-3xl font-bold">
          ${spendToday.toFixed(4)}{" "}
          <span className="text-base font-normal text-muted-foreground">
            / ${budget.toFixed(2)} presupuesto diario
          </span>
        </p>
        {killSwitchOn && (
          <p className="mt-2 font-semibold text-status-closed">
            ⛔ KILL SWITCH ACTIVO — el juez de coincidencias y los resúmenes están pausados hasta
            mañana.
          </p>
        )}
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Propósito</th>
              <th>Modelo</th>
              <th className="text-right">Llamadas</th>
              <th className="text-right">Tokens in/out</th>
              <th className="text-right">Costo est.</th>
            </tr>
          </thead>
          <tbody>
            {byPurpose.map((r) => (
              <tr key={`${r.purpose}-${r.model}`} className="border-t border-border">
                <td className="py-1.5">{r.purpose}</td>
                <td className="text-muted-foreground">{r.model}</td>
                <td className="text-right">{r._count}</td>
                <td className="text-right text-muted-foreground">
                  {Number(r._sum.inputTokens ?? 0).toLocaleString("es-PY")} /{" "}
                  {Number(r._sum.outputTokens ?? 0).toLocaleString("es-PY")}
                </td>
                <td className="text-right">${Number(r._sum.estCostUsd ?? 0).toFixed(4)}</td>
              </tr>
            ))}
            {byPurpose.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-muted-foreground">
                  Sin llamadas hoy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Últimos 14 días</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {last14d.map((d) => (
              <tr key={String(d.day)} className="border-t border-border">
                <td className="py-1">{new Date(d.day).toISOString().slice(0, 10)}</td>
                <td className="text-right text-muted-foreground">{d.calls} llamadas</td>
                <td className="text-right">${d.cost.toFixed(4)}</td>
              </tr>
            ))}
            {last14d.length === 0 && (
              <tr>
                <td className="py-2 text-muted-foreground">Sin datos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Muestras de coincidencias (calidad del juez)</h2>
        <div className="mt-2 space-y-3 text-sm">
          {recentMatches.map((m) => (
            <div key={m.id} className="border-t border-border pt-2">
              <p>
                <span className="font-semibold">{m.score}</span> · {m.verdict} ·{" "}
                <span className="text-muted-foreground">{m.profile.name}</span> →{" "}
                <a
                  href={`/licitaciones/${encodeURIComponent(m.tender.ocid)}`}
                  className="text-primary hover:underline"
                >
                  {m.tender.title.slice(0, 90)}
                </a>
                {m.userAction !== "NONE" && (
                  <span className="ml-2 rounded bg-accent px-1.5 text-xs">{m.userAction}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.fitReasons.join(" · ")}
                {m.cautions.length > 0 && <span> ⚠ {m.cautions.join(" · ")}</span>}
              </p>
            </div>
          ))}
          {recentMatches.length === 0 && <p className="text-muted-foreground">Sin matches aún.</p>}
        </div>
      </Card>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Feedback de usuarios</h2>
        <div className="mt-2 space-y-1 text-sm">
          {feedback.map((f) => (
            <p key={f.id} className="border-t border-border py-1">
              {f.helpful ? "👍" : "👎"} <span className="text-muted-foreground">{f.subject}</span>
              {f.comment && <span> — {f.comment}</span>}
              <span className="ml-2 text-xs text-muted-foreground">
                {f.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </p>
          ))}
          {feedback.length === 0 && <p className="text-muted-foreground">Sin feedback aún.</p>}
        </div>
      </Card>
    </main>
  );
}
