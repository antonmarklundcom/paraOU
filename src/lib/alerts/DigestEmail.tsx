// esbuild (tsx CLI / Vitest) uses the classic JSX runtime unless React is in
// scope, even though the app's own tsconfig ("preserve") lets Next.js handle
// JSX itself — this import is redundant under Next's build but required for
// the worker/CLI/test runs of this module.
import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Daily/weekly digest — React Email template (PHASE-5 #3, docs/05 §Alert emails).
 * Max ALERT_DIGEST_MAX_ITEMS items, deadline-first copy, deep links. Plain,
 * table-free-enough layout for reasonable Gmail/Outlook rendering.
 */
export interface DigestItem {
  ocid: string;
  title: string;
  buyerName: string | null;
  deadlineLabel: string;
  reasonLabel: string;
}

export interface DigestEmailProps {
  appUrl: string;
  companyName: string;
  items: DigestItem[];
  unsubscribeUrl: string;
}

export function digestSubject(companyName: string, items: DigestItem[]): string {
  const n = items.length;
  const noun = n === 1 ? "licitación nueva" : "licitaciones nuevas";
  const first = items[0];
  // deadlineLabel already reads "Cierra en N días" (src/lib/format.ts) — lowercase
  // it into "la primera: cierra en N días" instead of duplicating "cierra".
  const firstBit = first
    ? ` — la primera: ${first.deadlineLabel.charAt(0).toLowerCase()}${first.deadlineLabel.slice(1)}`
    : "";
  return `${n} ${noun} para ${companyName}${firstBit}`;
}

export function DigestEmail({ appUrl, companyName, items, unsubscribeUrl }: DigestEmailProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{digestSubject(companyName, items)}</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f5f5f4", padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            padding: 24,
            maxWidth: 480,
          }}
        >
          <Heading as="h2" style={{ fontSize: 18 }}>
            ◆ ParaOU — {companyName}
          </Heading>
          <Text style={{ color: "#57534e" }}>
            {items.length} {items.length === 1 ? "licitación nueva" : "licitaciones nuevas"} que
            podrían interesarte:
          </Text>
          {items.map((item) => (
            <Section key={item.ocid} style={{ marginTop: 16 }}>
              <Link
                href={`${appUrl}/licitaciones/${encodeURIComponent(item.ocid)}`}
                style={{ fontSize: 15, fontWeight: 600, color: "#1c1917" }}
              >
                {item.title}
              </Link>
              <Text style={{ margin: "4px 0 0", color: "#78716c", fontSize: 13 }}>
                {item.buyerName ?? "Comprador no especificado"} · ⏰ {item.deadlineLabel} ·{" "}
                {item.reasonLabel}
              </Text>
              <Hr style={{ marginTop: 12, borderColor: "#e7e5e4" }} />
            </Section>
          ))}
          <Text style={{ marginTop: 16 }}>
            <Link href={`${appUrl}/panel`} style={{ color: "#b91c1c" }}>
              Ver mi panel completo
            </Link>
          </Text>
          <Text style={{ marginTop: 24, fontSize: 11, color: "#a8a29e" }}>
            Verificá siempre en el pliego oficial de la DNCP.{" "}
            <Link href={unsubscribeUrl} style={{ color: "#a8a29e" }}>
              Cambiar preferencias de alertas
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
