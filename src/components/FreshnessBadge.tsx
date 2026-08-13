import { ingestionStatus } from "@/lib/api/status";
import { relativeAgeEs, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * "Datos actualizados hace 12 min" (PLAN.md Phase G, docs/07 #product-quality) —
 * builds trust vs. the official portal by showing the last successful sync, not
 * just claiming to be live. Server component: reads the (briefly cached)
 * `ingestionStatus()` used elsewhere for the stale-data banner.
 */
export async function FreshnessBadge({ className }: { className?: string }) {
  const status = await ingestionStatus();
  const label = status.fixtures
    ? "Datos de prueba (sin conexión en vivo a la DNCP)"
    : `Datos actualizados ${relativeAgeEs(status.lastRunAt)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        status.stale && !status.fixtures && "text-status-closing",
        className,
      )}
      title={status.lastRunAt ? `Última sincronización: ${formatDate(status.lastRunAt.toISOString())}` : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status.fixtures
            ? "bg-muted-foreground"
            : status.stale
              ? "bg-status-closing"
              : "bg-status-open",
        )}
      />
      {label}
    </span>
  );
}
