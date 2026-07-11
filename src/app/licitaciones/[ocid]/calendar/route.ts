import { getTenderDetail } from "@/lib/api/tenders";
import { ApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Format a Date as an iCalendar UTC timestamp (YYYYMMDDTHHMMSSZ). */
function ics(dt: Date): string {
  return dt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

/** Downloadable .ics reminder for a tender's bid deadline (docs/05). */
export async function GET(_req: Request, ctx: { params: Promise<{ ocid: string }> }) {
  const { ocid } = await ctx.params;
  let tender;
  try {
    tender = await getTenderDetail(ocid);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404)
      return new Response("Not found", { status: 404 });
    throw err;
  }
  if (!tender.deadlineAt) return new Response("No deadline", { status: 404 });

  const start = new Date(tender.deadlineAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/licitaciones/${encodeURIComponent(ocid)}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ParaOU//Licitaciones//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ocid}@paraou`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(start)}`,
    `DTEND:${ics(end)}`,
    `SUMMARY:${escapeText(`Cierre: ${tender.title}`)}`,
    `DESCRIPTION:${escapeText(`Cierre de ofertas. Fuente: DNCP. ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio: cierre de licitación mañana",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="licitacion-${ocid}.ics"`,
    },
  });
}
