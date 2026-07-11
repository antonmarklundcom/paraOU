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
this to a few hundred LLM calls/day → a few dollars/day at Haiku prices, cents at
low user counts. Costs scale with revenue (profiles), which is the right shape.

## Stage details

### Embeddings (ingest-time)
- Model: **Voyage `voyage-3.5`** (multilingual — handles Spanish well; Anthropic has
  no embeddings API). Alternative if avoiding a second vendor: open-source
  `multilingual-e5-large` self-hosted — but Voyage is simpler; cost is negligible.
- Embed: `title + category + truncated description` per tender; for profiles embed
  `description + keywords + category names`. Re-embed profile on edit.

### LLM judge (Claude)
- Model: start with **`claude-haiku-4-5`** for scoring (cheap, fast); use
  **`claude-sonnet-5`** for the user-facing tender summaries and the Business-tier
  "bid-readiness" document analysis.
- One call per (profile, tender) pair. Structured output (tool use / JSON schema):

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
  pairs. Batch API (50% discount) is fine here since matching is async.

### Feedback loop
`Match.userAction` (SAVED / BIDDING / DISMISSED) is gold: use dismissals to auto-add
exclude patterns (suggest, don't silently apply) and to tune thresholds. Later this
trains a proper ranking model.

## AI summaries (separate feature)
- On tender detail page: one cached paragraph in plain Spanish ("Qué piden, cuánto,
  para cuándo, qué necesitás para ofertar"), generated once per tender with Haiku at
  ingest for OPEN tenders only. English on demand for the EN toggle.
- Business tier: fetch the pliego PDFs (DNCP document links), extract text, and run
  a `claude-sonnet-5` requirements-checklist analysis. This is Phase 6+, on demand
  (user clicks "Analyze documents"), because PDFs are heavy.

## Cost guardrails (build these in Phase 4, not later)
- Per-day token budget with a kill switch + admin alert.
- Log every AI call: model, tokens, cost estimate, purpose → `ai_usage` table.
- Prompt caching for the static system/rubric portion of the judge prompt.
