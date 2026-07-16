import type {
  AiProvider,
  CategorySuggestion,
  EmbedResult,
  JudgeResult,
  ProfileForJudge,
  SuggestCategoriesResult,
  SummarizeResult,
  TenderForJudge,
} from "./types.js";

/**
 * Deterministic, offline, zero-cost provider used whenever no real API key is
 * configured (aiConfigured() === false). No network calls. Scoring is a genuine
 * keyword-overlap heuristic — not random — so the matching pipeline, its tests, and
 * demos all behave meaningfully without a Gemini key (CLAUDE.md rule 2: "build
 * against fixtures/dev transports and say so clearly rather than blocking").
 */

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "en",
  "y",
  "a",
  "los",
  "las",
  "del",
  "con",
  "para",
  "por",
  "un",
  "una",
  "que",
  "se",
  "su",
  "al",
  "es",
  "o",
  "los",
  "the",
  "and",
  "for",
  "of",
  "to",
  "in",
  "on",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Fake but stable 768-dim embedding: a hashed bag-of-words projection. Cosine
 * similarity between two such vectors correlates with real token overlap, which is
 * enough to exercise the Stage 2 pgvector recall path meaningfully in dev/tests. */
export function fakeEmbedding(text: string, dim = 768): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function tenderText(t: TenderForJudge): string {
  return [t.title, t.description, t.categoryName, t.procurementMethod].filter(Boolean).join(" ");
}

function overlapScore(profile: ProfileForJudge, tender: TenderForJudge): number {
  const profileTokens = tokenize(
    [profile.description, profile.keywords.join(" "), profile.certifications.join(" ")].join(" "),
  );
  const tenderTokens = tokenize(tenderText(tender));
  if (profileTokens.size === 0 || tenderTokens.size === 0) return 30;

  let hits = 0;
  for (const tok of profileTokens) if (tenderTokens.has(tok)) hits++;
  const ratio = hits / Math.min(profileTokens.size, 12); // cap so long descriptions aren't penalized
  let score = Math.round(30 + Math.min(ratio, 1) * 65);

  const excludeTokens = tokenize(profile.excludeKeywords.join(" "));
  for (const tok of excludeTokens) {
    if (tenderTokens.has(tok)) score = Math.min(score, 25);
  }
  if (profile.categoryCodes.length > 0 && tender.categoryName) {
    // categoryCodes are N5 codes, not names — we can't compare directly here, so this
    // is intentionally a no-op in the mock; category filtering already happened in
    // Stage 1 (SQL), so surviving pairs are already category-plausible.
  }
  return Math.max(0, Math.min(100, score));
}

function verdictFor(score: number): JudgeResult["verdict"] {
  if (score >= 80) return "strong";
  if (score >= 60) return "possible";
  if (score >= 40) return "weak";
  return "no";
}

export class MockProvider implements AiProvider {
  readonly name = "mock";

  async embed(text: string): Promise<EmbedResult> {
    return { vector: fakeEmbedding(text), usage: { promptTokens: text.length, estCostUsd: 0 } };
  }

  async judgeMatch(profile: ProfileForJudge, tender: TenderForJudge): Promise<JudgeResult> {
    const score = overlapScore(profile, tender);
    const verdict = verdictFor(score);
    const fitReasons: string[] = [];
    const cautions: string[] = [];

    if (score >= 60) {
      fitReasons.push(
        `La descripción de "${profile.name}" coincide con términos clave de "${tender.title}".`,
      );
    } else {
      fitReasons.push("Coincidencia parcial de términos entre el perfil y la licitación.");
    }
    if (tender.categoryName) fitReasons.push(`Categoría: ${tender.categoryName}.`);
    if (
      profile.amountMax &&
      tender.amountMax &&
      Number(tender.amountMax) > Number(profile.amountMax)
    ) {
      cautions.push("El monto supera el rango de contrato indicado en tu perfil.");
    }
    if (profile.certifications.length > 0) {
      cautions.push(
        `Verificá si se requieren certificaciones (${profile.certifications.join(", ")}).`,
      );
    }
    cautions.push("[Datos generados por el proveedor de prueba — sin GEMINI_API_KEY configurada]");

    return {
      score,
      verdict,
      fitReasons,
      cautions,
      usage: { promptTokens: 0, completionTokens: 0, estCostUsd: 0 },
    };
  }

  async summarize(tender: TenderForJudge): Promise<SummarizeResult> {
    const parts = [
      `${tender.title}.`,
      tender.buyerName ? `Compra: ${tender.buyerName}.` : null,
      tender.amountMax
        ? `Monto referencial: Gs. ${Number(tender.amountMax).toLocaleString("es-PY")}.`
        : null,
      tender.deadlineAt
        ? `Cierre: ${new Date(tender.deadlineAt).toLocaleDateString("es-PY")}.`
        : null,
      "[Resumen generado por el proveedor de prueba — sin GEMINI_API_KEY configurada]",
    ].filter(Boolean);
    return {
      summary: parts.join(" "),
      usage: { promptTokens: 0, completionTokens: 0, estCostUsd: 0 },
    };
  }

  async suggestCategories(
    description: string,
    candidates: CategorySuggestion[],
  ): Promise<SuggestCategoriesResult> {
    const descTokens = tokenize(description);
    const scored = candidates
      .map((c) => {
        const nameTokens = tokenize(c.name);
        let hits = 0;
        for (const t of nameTokens) if (descTokens.has(t)) hits++;
        return { c, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5)
      .map((x) => x.c);
    return { suggestions: scored, usage: { promptTokens: 0, completionTokens: 0, estCostUsd: 0 } };
  }

  async analyzeDocument(): Promise<never> {
    throw new Error("analyzeDocument is not implemented until Phase 6");
  }
}
