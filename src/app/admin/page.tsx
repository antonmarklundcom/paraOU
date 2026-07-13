import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/env";
import { ingestionStatus } from "@/lib/api/status";
import { Card } from "@/components/ui";
import { PlanOverrideForm } from "./PlanOverrideForm";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Admin dashboard (PHASE-6 #5): users/plans, sync health, AI spend, manual plan
 * override, alert stats. Session-gated by ADMIN_EMAILS — redirects unauthorized
 * visitors to /login rather than 404ing, since a signed-in non-admin should see
 * why (as opposed to /admin/ai's Phase 4 query-param gate, which stays 404).
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const [status, planCounts, spend14d, alertsSent7d, recentUsers] = await Promise.all([
    ingestionStatus(),
    prisma.user.groupBy({ by: ["plan"], _count: true }),
    prisma.$queryRaw<{ day: Date; cost: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, sum("estCostUsd")::float AS cost
      FROM "AiUsage" WHERE "createdAt" > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1 DESC
    `,
    prisma.alertLog.count({ where: { sentAt: { gt: new Date(Date.now() - 7 * 86400_000) } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        email: true,
        plan: true,
        manualBilling: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    }),
  ]);

  const totalSpend14d = spend14d.reduce((n, d) => n + d.cost, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Ingestion</p>
          <p className="mt-1 text-lg font-semibold">
            {status.fixtures ? "Fixtures" : "Live"} · {status.stale ? "⚠ stale" : "✓ fresh"}
          </p>
          <p className="text-xs text-muted-foreground">
            Last run: {status.lastRunAt?.toISOString() ?? "never"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">AI spend (14d)</p>
          <p className="mt-1 text-lg font-semibold">${totalSpend14d.toFixed(2)}</p>
          <a href="/admin/ai" className="text-xs text-primary hover:underline">
            Full AI dashboard →
          </a>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Alerts sent (7d)</p>
          <p className="mt-1 text-lg font-semibold">{alertsSent7d}</p>
        </Card>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Plans</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {planCounts.map((p) => (
              <tr key={p.plan} className="border-t border-border">
                <td className="py-1">{p.plan}</td>
                <td className="text-right">{p._count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Recent users</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Email</th>
                <th>Plan</th>
                <th>Sub. status</th>
                <th>Joined</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="max-w-[16rem] truncate py-1.5">{u.email}</td>
                  <td>
                    {u.plan}
                    {u.manualBilling && <span className="ml-1 text-xs text-muted-foreground">(manual)</span>}
                  </td>
                  <td className="text-muted-foreground">{u.subscriptionStatus ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {u.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td>
                    <PlanOverrideForm userId={u.id} currentPlan={u.plan} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
