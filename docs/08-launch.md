# Launch checklist (Phase 6)

What's automated in this repo vs. what the owner must still do by hand on the
Hostinger VPS. Work top to bottom — each section unblocks the next.

## 1. Provision the VPS

- Hostinger **VPS** (KVM 1/2 is enough), Ubuntu, Docker + Docker Compose installed.
- Point your domain's A/AAAA record at the VPS IP.
- `ufw allow 22,80,443/tcp` (SSH, HTTP, HTTPS); leave 5432 closed to the internet.

## 2. Day-one de-risk: DNCP reachability (docs/06 risk T4)

Before anything else, from **this VPS**, confirm `contrataciones.gov.py` isn't
geo/datacenter-blocking you:

```bash
curl -I https://contrataciones.gov.py/datos/api/oauth/token
```

If blocked, the fallback is routing the worker's DNCP calls through a small
proxy hosted in Paraguay/Brazil — do this before backfilling real data (step 7).

## 3. Clone + configure

```bash
git clone <repo-url> paraou && cd paraou
cp .env.example .env
```

Fill in `.env`: `DATABASE_URL` (leave as the compose default,
`postgresql://paraou:paraou@db:5432/paraou`), `DNCP_*`, `GEMINI_API_KEY`,
`AUTH_SECRET` (`openssl rand -base64 32`), `RESEND_API_KEY`,
`NEXT_PUBLIC_APP_URL` (your real domain, `https://...`), `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET` + the four `STRIPE_PRICE_*` ids (create these Prices in
the Stripe dashboard first — see step 5), `ADMIN_EMAILS` (your email, so
`/admin` isn't locked out).

Edit `Caddyfile`: replace `paraou.example.com` and `you@example.com` with your
real domain and email.

## 4. Bring up the stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile app up -d --build
```

This starts `db` (Postgres + pgvector), runs `migrate` once (`prisma migrate
deploy`), then `web`, `worker`, and `caddy` (automatic HTTPS via Let's
Encrypt — first request may take a few seconds while it issues the cert).

Verify: `curl https://yourdomain/api/health`.

## 5. Stripe setup (owner, in the Stripe dashboard)

1. Create two Products (Pro, Business), each with a monthly Price and an
   annual Price (annual = monthly × 10, i.e. "2 months free" per docs/00).
2. Copy the four Price ids into `.env` as `STRIPE_PRICE_{PRO,BUSINESS}_{MONTHLY,ANNUAL}`.
3. Add a webhook endpoint pointing at `https://yourdomain/api/billing/webhook`,
   subscribed to `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy its
   signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test-mode first: use Stripe's test cards, confirm a subscribe → `/cuenta`
   shows the new plan → `/admin` shows it too. Only then switch to live keys.
5. Enable the [Stripe customer portal](https://dashboard.stripe.com/settings/billing/portal)
   (cancel / update card) — `POST /api/billing/portal` needs it configured.

## 6. Email (Resend)

Verify your sending domain in Resend, set `RESEND_API_KEY` +
`RESEND_FROM_EMAIL`. Send a real magic-link sign-in and a real digest
(`npm run worker` locally, or wait for the daily cron on the VPS) and confirm
both land — check spam folder placement, not just delivery.

## 7. Data: backfill + verify

```bash
docker compose exec worker node_modules/.bin/tsx src/worker/backfill.ts --year=2024
```

Then spot-check counts against the DNCP portal's own search UI for a known
category/department — this is the only real check that ingestion mapped
fields correctly.

## 8. Backups

Nightly `pg_dump` from the VPS, shipped off-box (Hostinger object storage, S3,
or even scp to another host — anywhere but the same disk):

```cron
0 3 * * * docker compose exec -T db pg_dump -U paraou paraou | gzip > /backups/paraou-$(date +\%F).sql.gz
```

Add a weekly job that deletes backups older than N days, and actually test a
restore once (`gunzip -c backup.sql.gz | docker compose exec -T db psql -U paraou paraou`
into a scratch database) — an untested backup is not a backup.

## 9. Uptime + error tracking + analytics

- Uptime monitor: any free tier (UptimeRobot, Better Stack) pinging
  `/api/health` every few minutes, alerting you on failure.
- Error tracking: Sentry (or similar) — wire into `src/lib/log.ts`'s error
  path if you want stack traces beyond the structured pino logs.
- Analytics: Plausible or Umami (cookieless — no cookie-consent banner
  needed), self-hosted or their cloud tier. Add the script to
  `src/app/layout.tsx`.

## 10. SEO

- Submit `https://yourdomain/sitemap.xml` to Google Search Console.
- OG images: add a static `public/og-image.png` (1200×630) and reference it
  from `src/app/layout.tsx`'s metadata if not already set.

## 11. Legal pages + attribution

- `términos` and `privacidad` pages (not built — write them, ideally with a
  lawyer's pass given Stripe/payment data involved). Link from the footer.
- "Fuente: DNCP" already appears on tender pages (CLAUDE.md rule); double
  check it also appears on `/precios` and any marketing pages you add.
- Confirm DNCP's open-data portal terms allow this commercial reuse (docs/06
  risk B5) — the product deep-links to official documents rather than
  rehosting them, which is the safer posture, but verify the actual terms.

## Not yet built (fast-follow, not launch blockers)

- Multi-profile **switcher UI** for Business's 3-profile entitlement — the
  API/data model support it (`plan.ts` `maxProfiles`), the `/perfil` wizard
  and `/panel` still assume one profile per account.
- WhatsApp alerts (docs/00 Business tier promise) — email only today.
- Competitor watchlists, award-history analytics beyond the buyer-history
  teaser already on tender detail pages.
- Local payment rails (Bancard, Tigo Money) — Stripe only for now (docs/06 risk B4).
- OCR for scanned pliegos — document analysis returns a "not supported yet"
  result for those today.
