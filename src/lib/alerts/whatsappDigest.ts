import type { WhatsappTemplateKey } from "../whatsapp/templates.js";
import type { DigestItem } from "./DigestEmail.js";

/**
 * WhatsApp rendering of a digest (PHASE-F1 #3) — the channel's counterpart to
 * `DigestEmail.tsx`. WhatsApp has no HTML and no arbitrary copy: an alert is a
 * pre-approved template plus a handful of variables (see
 * `src/lib/whatsapp/templates.ts`), so "rendering" here means *choosing the
 * template and filling its slots*.
 *
 * Two templates, matching the two things a bidder cares about:
 *  - a single tender → the deadline-warning template, with buyer + deadline and
 *    a deep link straight to the tender (this is the "instant deadline warning"
 *    that makes the channel worth paying for);
 *  - several tenders → the digest template, leading with the most urgent one and
 *    linking to /panel.
 *
 * Pure and dependency-free so the variable order — which must match the copy
 * approved by Meta exactly — is unit-testable.
 */

/** WhatsApp text renders long titles badly on a phone; keep them scannable. */
const MAX_TITLE = 90;

export function truncateForWhatsapp(text: string, max = MAX_TITLE): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export interface WhatsappDigestMessage {
  template: WhatsappTemplateKey;
  variables: string[];
}

export function buildWhatsappDigest(
  appUrl: string,
  companyName: string,
  items: DigestItem[],
): WhatsappDigestMessage | null {
  if (items.length === 0) return null;
  const first = items[0]!;

  if (items.length === 1) {
    return {
      template: "deadline",
      variables: [
        truncateForWhatsapp(first.title),
        first.buyerName ?? "Comprador no especificado",
        `${first.deadlineLabel} · ${first.reasonLabel}`,
        `${appUrl}/licitaciones/${encodeURIComponent(first.ocid)}`,
      ],
    };
  }

  return {
    template: "digest",
    variables: [
      companyName,
      String(items.length),
      truncateForWhatsapp(first.title),
      first.deadlineLabel,
      `${appUrl}/panel`,
    ],
  };
}
