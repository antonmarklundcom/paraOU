# Improvement Ideas & Future Roadmap

Ideas beyond the six build phases, roughly ordered by impact-per-effort. None of
these block launch; revisit after Phase 6 with real user feedback.

## High impact, low-medium effort

1. **PAC early-warning (planificaciones)** — DNCP publishes agencies' _annual
   procurement plans_ before tenders exist. "Ministerio de Salud plans to buy
   ambulances in Q4" months in advance is intelligence nobody else surfaces well.
   Cheap to add (same API, same pipeline) and a strong Business-tier hook.
2. **WhatsApp alerts** — the single most Paraguay-appropriate feature. Business
   channel of choice there. Twilio/360dialog WhatsApp Business API; send the daily
   digest + instant deadline warnings. Likely the #1 driver of word-of-mouth.
3. **"Why did I lose?" award notifications** — user marked "Voy a ofertar"; when the
   award is published, notify: who won, at what price, % below reference. Closes
   the emotional loop and proves the data's value every cycle.
4. **Buyer payment-behavior signal** — from contract/amendment data, estimate how
   slowly each agency pays or how often contracts get modified/cancelled. "This
   buyer cancels 18% of processes" is decision-changing info for SMEs.
5. **Deadline calendar view + Google Calendar sync** — bidders live by deadlines
   (offer submission, Q&A cutoff, site visits, guarantee validity). A calendar tab
   over their saved/matched tenders is cheap and sticky.

## Differentiators (medium effort)

6. **Bid/no-bid assistant** — combine match score + competition history (how many
   bidders usually show up for this buyer/category, incumbents' win streaks) into a
   one-screen recommendation. This is what expensive consultants do manually.
7. **Reference-price analytics** — historical awarded price vs. reference price by
   category → "bids in this category typically win at 12–18% below reference."
   Directly affects users' pricing → very high willingness to pay.
8. **Team workflows (Business/Agency)** — assign tenders to teammates, status board
   (evaluando → preparando → presentada → ganada/perdida), notes. Turns a feed into
   a lightweight CRM; big churn reducer since data accumulates.
9. **Consultant marketplace** — free users who can't write bids meet vetted
   gestores who can; take a referral fee. Marketplace dynamics on top of the data.

## Long-term bets

10. **Country expansion via OCDS adapters** — Uruguay/Chile/Colombia/Ecuador (see
    docs/00). Each adds a market with the same codebase; sell regional plans to
    multinationals.
11. **Win-probability ML model** — 15 years of (tender, bidders, winner, price)
    outcomes is a real training set. Start collecting user outcome labels
    (won/lost) from day one so this is possible later.
12. **Public transparency angle** — a free "observatorio" page (biggest awards this
    week, concentration stats) earns press links and SEO authority; journalists
    become distribution.

## Product-quality details worth doing early

- **Data-freshness badge** ("Datos actualizados hace 22 min") builds trust vs. the
  official portal.
- **Onboarding by RUC**: user enters their tax id → we pre-fill their profile from
  their own past awards in the supplier data (magic moment).
- **Dismissal reasons** ("too big", "wrong region", "we don't do that") — one-tap
  chips that immediately tune matching; users feel the AI learning.
- **Es/En AI output toggle** per user, not per site — foreign bidders get English
  summaries of Spanish tenders (unique selling point; nobody local does this).
- Keep **all public tender pages free forever** — they are the SEO engine; gate
  intelligence (matching, history, analytics), never the public record.
