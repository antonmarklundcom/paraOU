# AI Matching Design

Goal: for each company profile, surface **only** the tenders they can plausibly win,
ranked 0–100, with a human-readable explanation and warnings. Cheap enough to run on
every new tender for every active profile.

## Three-stage funnel (cost pyramid)

```
Stage 1  HARD FILTERS      free        SQL: status=OPEN, deadline>now(+3d),
                                       geo ∈ profile.departments,
                                       amount within range (if set),
                                       exclude-keywords NOT matched
Stage 2  SEMANTIC RECALL   ~free       pgvector cosine(profile.embedding,
                                       tender.embedding) → top N=30 candidates
                                       (blend with FTS keyword hits)
Stage 3  LLM JUDGE         ~$0.001–01  Claude scores each surviving pair
         (only pairs that pass 1+2)    → score, reasoning, cautions → cache in Match
```

Volume math: ~50–150 new tenders/day × (say) 500 active profiles → stages 1+2 cut
this to a few hundred LLM calls/day → a few dollars/day at Flash-Lite prices, cents at
low user counts. Costs scale with revenue (profiles), which is the right shape.

## Stage details

## Provider decision: Google Gemini (default), pluggable

**Owner decision (2026-07): use Google Gemini as the runtime AI provider** to
minimize operating cost — one vendor covers both embeddings and LLM calls, with a
free tier for development. Claude remains an optional drop-in for the premium
document-analysis feature if quality comparisons justify it later.

Implementation requirement: all AI calls go through a thin provider abstraction
(`src/lib/ai/provider.ts`) exposing `embed()`, `judgeMatch()`, `summarize()`,
`analyzeDocument()`. Provider selected via `AI_PROVIDER` env (`gemini` default,
`anthropic` optional). **Verify current model ids in the provider's docs at build
time — do not hardcode from this plan.** Indicative (mid-2026):

| Job | Gemini (default) | Anthropic (optional) |
|---|---|---|
| Embeddings | `gemini-embedding-001` (set `outputDimensionality` via env, default 768) | Voyage `voyage-3.5` |
| Match judge (high volume) | `gemini-2.5-flash-lite` | `claude-haiku-4-5` |
| Tender summaries | `gemini-2.5-flash` | `claude-haiku-4-5` |
| Document analysis (premium) | `gemini-2.5-pro` (or Gemini 3) | `claude-sonnet-5` |

Note: embedding dimension is set once in env (`EMBEDDING_DIM`, pgvector column
sized to match); switching dimension/provider later requires re-embedding — that's
fine, embeddings are cheap and recomputable from `Tender.raw`.

### Embeddings (ingest-time)
- Embed: `title + category + truncated description` per tender; for profiles embed
  `description + keywords + category names`. Re-embed profile on edit.

### LLM judge
- One call per (profile, tender) pair. Structured output (JSON schema / function
  calling — both providers support it):

```json
{
  "score": 0-100,
  "fit_reasons": ["..."],          // in user's locale
  "cautions": ["requires ISO 13485", "site visit mandatory in Encarnación"],
  "verdict": "strong|possible|weak|no"
}
```

- Prompt inputs: profile (description, categories, certs, size range) + tender
  (title, description, buyer, amount, method, key dates, category). **Wrap tender
  text as untrusted data** — tender descriptions are third-party content; instruct
  the model to treat them as data, not instructions (prompt-injection hygiene).
- Threshold: only store/show matches with score ≥ 50; alert on ≥ 70 (tune later).
- Cache forever per (profile-version, tender-version) — never re-score unchanged
  pairs. Batch mode (both providers discount ~50%) is fine here since matching is
  async.

### Feedback loop
`Match.userAction` (SAVED / BIDDING / DISMISSED) is gold: use dismissals to auto-add
exclude patterns (suggest, don't silently apply) and to tune thresholds. Later this
trains a proper ranking model.

## AI summaries (separate feature)
- On tender detail page: one cached paragraph in plain Spanish ("Qué piden, cuánto,
  para cuándo, qué necesitás para ofertar"), generated once per tender with the
  cheap summary model at ingest for OPEN tenders only. English on demand for the EN
  toggle.
- Business tier: fetch the pliego PDFs (DNCP document links), extract text, and run
  the premium document-analysis model. This is Phase 6+, on demand
  (user clicks "Analyze documents"), because PDFs are heavy.

## Cost guardrails (build these in Phase 4, not later)
- Per-day token budget with a kill switch + admin alert.
- Log every AI call: model, tokens, cost estimate, purpose → `ai_usage` table.
- Context/prompt caching for the static system/rubric portion of the judge prompt
  (both providers support it).
