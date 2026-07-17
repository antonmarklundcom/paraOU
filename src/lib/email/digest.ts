import { formatGs, formatDate, deadlinePhrase } from "../format.js";

/**
 * Daily digest email (docs/05 §Alert emails): max 10 items, deadline-first, deep
 * links, "N licitaciones nuevas para [Company]" subject with the first item's
 * deadline. Hand-written HTML/text (email-safe: no external CSS, inline styles
 * only) rather than a templating framework — kept dependency-free and simple to
 * verify; the deliverable (correct structure, deep links, unsubscribe header) is
 * unaffected.
 */

export interface DigestItem {
  ocid: string;
  title: string;
  buyerName: string | null;
  amountMax: string | null;
  deadlineAt: string | null;
  daysUntilDeadline: number | null;
  reason: string; // why this is here: match score, saved search name, or "changed"
}

export interface DigestInput {
  companyName: string;
  appUrl: string;
  items: DigestItem[]; // already capped to <=10, sorted deadline-first
  unsubscribeUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function digestSubject(input: DigestInput): string {
  const n = input.items.length;
  const noun = n === 1 ? "licitación nueva" : "licitaciones nuevas";
  const first = input.items[0];
  const closesPart = first?.deadlineAt
    ? ` — la primera cierra el ${formatDate(first.deadlineAt)}`
    : "";
  return `${n} ${noun} para ${input.companyName}${closesPart}`;
}

function itemHtml(item: DigestItem, appUrl: string): string {
  const url = `${appUrl}/licitaciones/${encodeURIComponent(item.ocid)}`;
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee">
        <a href="${url}" style="color:#b91c3c;font-weight:600;text-decoration:none;font-size:15px">${escapeHtml(item.title)}</a>
        <div style="color:#666;font-size:13px;margin-top:2px">${escapeHtml(item.buyerName ?? "")}</div>
        <div style="color:#333;font-size:13px;margin-top:4px">
          ${escapeHtml(formatGs(item.amountMax))} · ${escapeHtml(deadlinePhrase(item.daysUntilDeadline))}
          ${item.deadlineAt ? ` (${escapeHtml(formatDate(item.deadlineAt))})` : ""}
        </div>
        <div style="color:#999;font-size:12px;margin-top:4px">${escapeHtml(item.reason)}</div>
      </td>
    </tr>`;
}

export function renderDigestHtml(input: DigestInput): string {
  const rows = input.items.map((i) => itemHtml(i, input.appUrl)).join("");
  return `<!doctype html><html><body style="font-family:sans-serif;background:#f7f7f7;padding:24px;margin:0">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
      <h1 style="font-size:18px;margin:0 0 4px">${escapeHtml(input.companyName)}</h1>
      <p style="color:#666;font-size:13px;margin:0 0 16px">Licitaciones nuevas o por cerrar que coinciden con tu perfil.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin-top:20px">
        <a href="${input.appUrl}/panel" style="display:inline-block;background:#b91c3c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Ver mi panel</a>
      </p>
      <p style="color:#999;font-size:11px;margin-top:24px">
        Fuente: DNCP. Verificá siempre en el pliego oficial.
        <a href="${input.unsubscribeUrl}" style="color:#999">Cancelar alertas</a>
      </p>
    </div>
  </body></html>`;
}

export function renderDigestText(input: DigestInput): string {
  const lines = input.items.map(
    (i) =>
      `- ${i.title} (${i.buyerName ?? "—"}) — ${formatGs(i.amountMax)} — ${deadlinePhrase(i.daysUntilDeadline)}\n  ${input.appUrl}/licitaciones/${encodeURIComponent(i.ocid)}`,
  );
  return [
    `${input.companyName} — licitaciones nuevas o por cerrar`,
    "",
    ...lines,
    "",
    `Ver panel: ${input.appUrl}/panel`,
    `Cancelar alertas: ${input.unsubscribeUrl}`,
  ].join("\n");
}
