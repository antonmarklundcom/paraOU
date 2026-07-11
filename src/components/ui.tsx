"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { dict, statusTone } from "@/lib/i18n";

/** Shared presentational primitives (shadcn-style tokens, no client JS). */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

const toneClasses = {
  open: "text-status-open",
  closing: "text-status-closing",
  closed: "text-status-closed",
} as const;

export function StatusBadge({
  status,
  daysUntilDeadline,
}: {
  status: string;
  daysUntilDeadline: number | null;
}) {
  const tone = statusTone(status, daysUntilDeadline);
  const label = dict().status[status as keyof ReturnType<typeof dict>["status"]] ?? status;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", toneClasses[tone])}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "open" && "bg-status-open",
          tone === "closing" && "bg-status-closing",
          tone === "closed" && "bg-status-closed",
        )}
      />
      {label}
    </span>
  );
}

export function Chip({
  children,
  removeHref,
  label,
}: {
  children: React.ReactNode;
  removeHref?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      {children}
      {removeHref && (
        <Link
          href={removeHref}
          aria-label={label ? `Quitar filtro ${label}` : "Quitar filtro"}
          className="ml-0.5 rounded-full px-1 text-muted-foreground hover:bg-border hover:text-foreground"
        >
          ×
        </Link>
      )}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
      {children}
    </span>
  );
}
