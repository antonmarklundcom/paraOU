# ParaOU — Paraguay Public Procurement Intelligence

**"Offentlig upphandling" för Paraguay.** A SaaS platform that ingests every public
tender (licitación / convocatoria) published by Paraguay's DNCP (Dirección Nacional de
Contrataciones Públicas), and gives businesses that sell to the state a beautiful,
filterable overview plus **AI matching**: "show me only the tenders my company can
actually win, ranked, with a plain-language explanation."

## Status

📋 **Planning complete — ready to build.** This repo currently contains the full plan.
Code is built phase by phase per `plan/`.

## Read this first (order matters)

| Doc | What it covers |
|---|---|
| [docs/00-vision.md](docs/00-vision.md) | Product vision, target users, business model, revenue ideas |
| [docs/01-dncp-api.md](docs/01-dncp-api.md) | The DNCP API v3: auth, endpoints, rate limits, what's free, what you must register for |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture (Node.js), hosting on Hostinger, deployment |
| [docs/03-data-model.md](docs/03-data-model.md) | Database schema |
| [docs/04-ai-matching.md](docs/04-ai-matching.md) | How AI matching works (filters → embeddings → LLM scoring) |
| [docs/05-ux-ui.md](docs/05-ux-ui.md) | UX/UI specification for the tender overview and detail pages |
| [docs/06-risks.md](docs/06-risks.md) | Known issues, risks, and mitigations |
| [docs/07-improvement-ideas.md](docs/07-improvement-ideas.md) | Post-launch roadmap and feature ideas |

## Build phases (for the coding agent)

Execute in order. Each phase doc is self-contained with acceptance criteria.
Start each build session with the prompt in [plan/KICKOFF-PROMPT.md](plan/KICKOFF-PROMPT.md).

1. [plan/PHASE-1-ingestion.md](plan/PHASE-1-ingestion.md) — DNCP client + database + sync worker
2. [plan/PHASE-2-api.md](plan/PHASE-2-api.md) — Internal REST API: search, filter, sort
3. [plan/PHASE-3-frontend.md](plan/PHASE-3-frontend.md) — Web app: overview, filters, detail page
4. [plan/PHASE-4-ai-matching.md](plan/PHASE-4-ai-matching.md) — Company profiles + AI match scoring
5. [plan/PHASE-5-accounts-alerts.md](plan/PHASE-5-accounts-alerts.md) — Auth, saved searches, email alerts
6. [plan/PHASE-6-monetization.md](plan/PHASE-6-monetization.md) — Plans, billing, launch checklist

## What the owner must do manually (cannot be automated)

See [docs/01-dncp-api.md](docs/01-dncp-api.md#what-you-must-do-yourself) — register on the
DNCP portal for API credentials, get an Anthropic API key, verify Hostinger Node.js
support, and pick a domain.
