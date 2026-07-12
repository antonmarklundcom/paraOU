# Kickoff prompt for the build session

Copy-paste the prompt below into a new Claude Code chat (Opus 4.8) opened on this
repository to start building. Repeat with the next phase number in fresh chats as
each phase's acceptance criteria pass.

---

Read CLAUDE.md, then docs/01-dncp-api.md and docs/02-architecture.md, then
plan/PHASE-1-ingestion.md. Implement Phase 1 exactly as specified in that phase
doc — it is the spec; the docs/ folder explains the reasoning.

Context you need:

- My DNCP API credentials are already in `.env` (never commit it; keep
  `.env.example` in sync when you add variables).
- If the DNCP API is unreachable from this environment, follow the fixtures
  fallback in the phase doc and clearly list what I must verify manually.
- Work in small commits with clear messages. When acceptance criteria pass, run
  the full test suite, update the README status section, and push.

Definition of done for this session: every acceptance criterion at the bottom of
plan/PHASE-1-ingestion.md passes, CI is green, and you give me (1) a short summary
of what was built, (2) anything you had to deviate from in the plan and why, and
(3) the exact manual steps I must do before the next phase.

---

For later sessions, reuse the same prompt replacing `PHASE-1-ingestion.md` with:
PHASE-2-api.md → PHASE-3-frontend.md → PHASE-4-ai-matching.md (needs
`GEMINI_API_KEY` in `.env`) → PHASE-5-accounts-alerts.md (needs `RESEND_API_KEY`,
`AUTH_SECRET`) → PHASE-6-monetization.md (needs Stripe keys + price IDs).
