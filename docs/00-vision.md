# Vision & Business Model

## The idea in one sentence

Every company that wants to sell goods or services to the Paraguayan state must today
dig through the DNCP portal (contrataciones.gov.py) — a functional but bureaucratic
government site, in dense legal Spanish, with no personalization. **ParaOU turns that
firehose into a personalized deal-flow feed**: clean UX, powerful filters, and an AI
that reads every tender and tells each company which ones fit them and why.

This is a proven category. In Sweden the same model (Opic/Mercell, Pabliq, Tendium),
in the EU (TED aggregators), in the US (GovWin, BidPrime) — companies pay
$50–$500/month for exactly this because **one won contract pays for years of
subscription**. Paraguay has no strong incumbent doing AI-grade matching.

## Target users

1. **SMEs selling to the state** (construction, IT, cleaning, food/catering, medical
   supplies, consultancy). They miss tenders because nobody watches the portal daily.
   This is the core paying user.
2. **Larger bid/tender departments** — want competitor intelligence: who wins what,
   at what price, which buyers pay late.
3. **Foreign companies entering Paraguay** — need an English/Swedish-friendly window
   into the market. (Underserved niche: DNCP is Spanish-only.)
4. **Consultants/gestores** who prepare bids for others — they can run many client
   profiles at once (agency plan).

## Why Paraguay specifically, and why this can scale

- DNCP publishes **everything** as open data under the OCDS standard (Open
  Contracting Data Standard) — free API, machine-readable, full history since ~2010.
- Because the data layer is OCDS, **the same codebase extends to other OCDS
  publishers**: Chile (ChileCompra), Colombia (SECOP), Mexico, Ecuador, Uruguay,
  Dominican Republic all publish OCDS. Build once for Paraguay, then each new country
  is mostly a new ingestion adapter → a Latin-America-wide product. This is the real
  long-term prize.

## Revenue model (recommended ladder)

| Tier | Price (indicative) | What they get |
|---|---|---|
| **Free** | $0 | Browse all tenders, basic filters, 3-day delayed data or limited results. Purpose: SEO + funnel. |
| **Pro** | ~$29–49/mo | Real-time data, unlimited filters, saved searches, daily email alerts, AI match feed for 1 company profile. |
| **Business** | ~$99–149/mo | Everything + WhatsApp alerts, competitor tracking (who won, prices), award-history analytics, AI bid summaries, 3 profiles, multi-user. |
| **Agency/API** | ~$299+/mo | Many profiles, API access, white-label reports. |

Pricing notes for Paraguay: purchasing power is lower than EU — price in USD but keep
Pro under ~Gs. 400,000/mo equivalent. The buyers ROI-justify easily: DNCP moves
billions of USD/year in public contracts.

### Additional revenue ideas (rank-ordered by effort/return)

1. **Email/WhatsApp alerts as THE killer feature.** In Paraguay, WhatsApp is the
   default business channel. "New tender matching your profile — 12 days to
   deadline" on WhatsApp is worth the subscription alone. (WhatsApp Business API via
   Twilio/360dialog; email first, WhatsApp in v2.)
2. **Competitor & buyer intelligence** from the `adjudicaciones` (awards) and
   `contratos` data: who wins in your category, at what price, win rates, average
   discount vs. reference price. Historic data back to ~2010 exists. This justifies
   the Business tier and is hard for competitors to copy quickly.
3. **AI bid-readiness summaries**: LLM reads the tender documents (pliegos) and
   outputs requirements checklist, disqualification traps, deadlines, guarantee
   amounts. Big time-saver; charge per-use or bundle in Business.
4. **SEO free layer**: every tender gets a public, indexed page ("Licitación 4XX,XXX
   — Adquisición de..."). Paraguay-specific procurement searches have weak
   competition → organic funnel.
5. **Win-probability scoring** (later): trained on 15 years of award data.
6. **Country expansion** (see above) — same product, new flag.
7. **Data/report sales**: quarterly market reports per sector (medical, construction)
   sold one-off to enterprises; also useful marketing.

## What makes it great for the end user (the bidder)

- **Zero-noise feed**: they see 10 relevant tenders, not 300 irrelevant ones.
- **Explanations, not scores**: "Matches: you sell medical supplies in Asunción;
  buyer is Ministerio de Salud; contract size Gs. 500M is within your range.
  Caution: requires ISO 13485 certificate."
- **Deadline discipline**: countdown badges, calendar export, alert escalation.
- **Everything in one place**: tender → documents → Q&A deadlines → award history of
  that buyer → who else usually bids.
- **Language**: UI in Spanish (primary) + English toggle. AI summaries can be
  generated in the user's language — a real differentiator for foreign bidders.

## KPIs

North star: **# of tenders users mark "I'm bidding on this"**. Secondary: weekly
active profiles, alert CTR, free→paid conversion, churn.
