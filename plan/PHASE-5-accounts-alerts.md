# Phase 5 — Auth, saved searches, alerts

**Goal:** retention loop — users sign up, save searches, and get daily emails that
bring them back.
**Prereqs in `.env`:** `RESEND_API_KEY` (or SMTP creds), `AUTH_SECRET`, Google OAuth
creds (optional).

## Deliverables

1. **Auth.js**: email magic link (primary) + Google OAuth. On first login, migrate
   the anonymous localStorage profile/actions into the DB. Session-aware header,
   `/panel` gated.
2. **Saved searches**: "Guardar búsqueda" from `/licitaciones` serializes filter
   state → `SavedSearch`; manage (rename, toggle alert, delete) from `/panel`.
3. **Alert engine** (worker job after each sync + matching run):
   - For each user: new tenders matching saved searches ∪ new `Match` ≥ 70 ∪
     changes on followed tenders (deadline moved, status change, cancelled).
   - Dedupe via `AlertLog`; respect plan gates (FREE: none or weekly teaser; PRO+:
     daily digest; instant = Business).
   - **Daily digest email** per docs/05 §Alert emails: React Email template, max 10
     items, deadline-first copy, deep links, unsubscribe/preferences link
     (one-click list-unsubscribe header — deliverability matters).
4. **Follow feature**: 🔔 on tender detail persists; TenderEvents (Phase 1) drive
   "changed" alerts.
5. **Transactional email plumbing**: dev = console/preview transport; prod =
   Resend/SMTP; log sends; bounce handling (mark address bad after hard bounce).
6. **Basic account page**: locale (es/en), alert channel & frequency, delete
   account (GDPR-style full wipe — cheap now, painful later).

## Acceptance criteria
- New user: signup via magic link < 60 s; anonymous profile carried over.
- Seed a new matching tender → next digest run emails exactly one alert; re-running
  sends nothing (AlertLog dedupe test).
- Digest renders correctly in Gmail/Outlook (use React Email preview snapshots).
- Deleting the account removes user, profiles, matches, alert logs.
- Playwright e2e: signup → create profile → save search → receive (dev-transport)
  digest containing the expected tender.
