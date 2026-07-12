# Phase 4 — Company profiles + AI matching

**Goal:** the differentiator. Implement docs/04-ai-matching.md end to end.
**Prereqs in `.env`:** `GEMINI_API_KEY` (default provider; `ANTHROPIC_API_KEY`
only if `AI_PROVIDER=anthropic`).
Before writing AI code, verify current model ids and structured-output patterns in
the provider's live docs — do not code from memory. Model choices per docs/04.

## Deliverables

0. **`src/lib/ai/provider.ts`** — provider abstraction per docs/04: `embed()`,
   `judgeMatch()`, `summarize()`, `analyzeDocument()`; Gemini implementation is
   required, Anthropic implementation may be a stub that throws "not configured".
   `AI_PROVIDER`, `EMBEDDING_DIM` from env.
1. **`src/lib/ai/embeddings.ts`** — `gemini-embedding-001` wrapper (batch, retry,
   `outputDimensionality` = `EMBEDDING_DIM`); worker job embeds new tenders at
   ingest; backfill command embeds existing OPEN tenders first, then history lazily.
2. **Profile wizard `/perfil`** per docs/05 §4 (3 steps; category suggestions from
   the free-text description via one cheap-model call; instant 5 sample matches at
   the end). Profiles persist for anonymous users in localStorage until Phase 5
   auth, then migrate.
3. **Match pipeline** (worker job, runs after each incremental sync):
   - Stage 1 SQL hard filters → Stage 2 pgvector top-30 per profile (blend FTS) →
   - Stage 3 LLM judge (`gemini-2.5-flash-lite`, JSON schema from docs/04,
     tender text wrapped as untrusted data, cached rubric) → upsert `Match`.
   - Only new/changed (profile-version × tender-version) pairs. Batch mode where
     latency doesn't matter.
4. **AI summaries**: one-paragraph "Resumen en simple" for OPEN tenders at
   ingest; render on detail page with the "Verificá en el pliego oficial"
   disclaimer + feedback button.
5. **Feed UI**: match badge + expandable reasoning on rows (unflag the Phase 3
   component); `/panel` feed grouped Nuevos / Cierran pronto / Guardados; match
   actions (save/bid/dismiss) persisted to `Match.userAction`.
6. **Cost controls**: `ai_usage` log table (model, tokens, purpose, est. cost);
   daily budget env var + kill switch that pauses stage 3 and logs loudly;
   admin page `/admin/ai` (env-gated) showing spend and match quality samples.

## Acceptance criteria

- Create a realistic profile ("empresa constructora en Itapúa, obras viales hasta
  Gs. 5.000 mill.") → feed shows plausibly relevant tenders ranked, each with
  Spanish reasoning and cautions; an obviously irrelevant tender (e.g. medical
  supplies) scores < 50.
- Editing the profile re-scores; unchanged pairs are never re-sent to the LLM
  (verify via `ai_usage`).
- Pipeline for 1 profile × 1 day of tenders costs < $0.05 (check `ai_usage`).
- Unit tests for stages 1–2 (SQL/vector, deterministic); recorded-response tests
  for stage 3 parsing; kill switch test.
