import { env } from "../env.js";

/**
 * WhatsApp message templates (PHASE-F1 #3).
 *
 * Outside the 24-hour customer-service window — which is where every ParaOU
 * alert lives, since we message users who are not currently chatting with us —
 * the WhatsApp Business API only accepts **pre-approved templates**. A template
 * is a fixed body with numbered placeholders; we may substitute the variables,
 * never the prose.
 *
 * That approval happens in Meta's Business Manager (via Twilio Content Editor
 * or 360dialog), so this file is the single source of truth for:
 *   - the exact Spanish body the owner must submit for approval (`body`), and
 *   - the variable order the code fills in (`variables`).
 * Once approved, the provider returns a template id (Twilio Content SID "HX…")
 * which is configured per template via env — see docs/09-whatsapp.md.
 *
 * The dev transport renders `body` locally so the whole flow is exercisable
 * without an account (CLAUDE.md rule 2).
 */

export type WhatsappTemplateKey = "digest" | "deadline" | "verification";

export interface WhatsappTemplateDef {
  key: WhatsappTemplateKey;
  /** Name to register with Meta (lowercase + underscores, per Meta's rules). */
  name: string;
  /** Meta template category — drives pricing and approval rules. */
  category: "UTILITY" | "AUTHENTICATION";
  language: "es";
  /** Ordered variable names, purely for readability at call sites. */
  variables: string[];
  /** The approved body, with {{1}}-style placeholders. */
  body: string;
}

export const WHATSAPP_TEMPLATES: Record<WhatsappTemplateKey, WhatsappTemplateDef> = {
  digest: {
    key: "digest",
    name: "paraou_digest_es",
    category: "UTILITY",
    language: "es",
    variables: ["companyName", "count", "firstTitle", "firstDeadline", "panelUrl"],
    body:
      "◆ ParaOU — {{1}}\n\n" +
      "Tenés {{2}} licitación(es) nueva(s) que coinciden con tu perfil.\n\n" +
      "La más urgente: {{3}} ({{4}}).\n\n" +
      "Ver todas: {{5}}\n\n" +
      "Verificá siempre el pliego oficial de la DNCP. Respondé BAJA para no recibir más avisos.",
  },
  deadline: {
    key: "deadline",
    name: "paraou_cierre_es",
    category: "UTILITY",
    language: "es",
    variables: ["title", "buyerName", "deadlineLabel", "tenderUrl"],
    body:
      "⏰ ParaOU — {{1}}\n\n" +
      "Comprador: {{2}}\n" +
      "{{3}}\n\n" +
      "Ver licitación: {{4}}\n\n" +
      "Verificá siempre el pliego oficial de la DNCP. Respondé BAJA para no recibir más avisos.",
  },
  verification: {
    key: "verification",
    name: "paraou_verificacion_es",
    category: "AUTHENTICATION",
    language: "es",
    variables: ["code", "ttlMinutes"],
    body:
      "Tu código de verificación de ParaOU es {{1}}. " +
      "Vence en {{2}} minutos. Si no lo pediste, ignorá este mensaje.",
  },
};

/** The provider-side id for an approved template, or null when unconfigured. */
export function templateProviderId(key: WhatsappTemplateKey): string | null {
  switch (key) {
    case "digest":
      return env.WHATSAPP_TEMPLATE_DIGEST_ID ?? null;
    case "deadline":
      return env.WHATSAPP_TEMPLATE_DEADLINE_ID ?? null;
    case "verification":
      return env.WHATSAPP_TEMPLATE_VERIFICATION_ID ?? null;
  }
}

/**
 * Substitutes {{n}} placeholders — used by the dev transport for a readable log
 * line, and by tests. Production sends variables to the provider, which renders
 * the *approved* copy; this local render is a faithful preview, not the wire
 * format.
 */
export function renderTemplate(key: WhatsappTemplateKey, variables: string[]): string {
  return WHATSAPP_TEMPLATES[key].body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => {
    const value = variables[Number(n) - 1];
    return value === undefined ? `{{${n}}}` : value;
  });
}

/** Provider wire format for numbered variables: `{"1": "…", "2": "…"}`. */
export function variablesToNumberedMap(variables: string[]): Record<string, string> {
  return Object.fromEntries(variables.map((v, i) => [String(i + 1), v]));
}
