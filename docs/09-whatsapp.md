# 09 — WhatsApp alerts (Phase F1)

WhatsApp is ParaOU's second alert delivery channel, next to email. It is the
single most Paraguay-appropriate feature in `docs/07` (#2) and the Business-tier
promise made in `docs/00`.

**Status in this build: fully implemented, fixture/dev-transport only.** No
Twilio or 360dialog account was connected while it was built, so nothing has
ever been sent to a real handset. Everything below section 3 is what the owner
must do to switch it on.

---

## 1. How it works

```
worker cron ──► runAlertEngine(["INSTANT"|"DAILY"|"WEEKLY"])
                  └─ sendDigestForUser(userId)
                       ├─ eligibleChannels(user)         src/lib/alerts/channels.ts
                       ├─ collectAlertCandidates(user, channel)   (per-channel dedupe)
                       ├─ email    → DigestEmail.tsx  → src/lib/email.ts
                       └─ whatsapp → whatsappDigest.ts → src/lib/whatsapp/outbox.ts
                                                          └─ provider.ts (Twilio | dev)
provider webhook ──► POST /api/whatsapp/webhook
                       ├─ status callback → recordDeliveryStatus() → WhatsappMessage
                       │                                           └─ failure budget → User
                       └─ inbound "BAJA"/"STOP" → handleInboundMessage() → opt-out
```

Key decisions:

- **One alert engine, two channels.** Collection, reason priority, item caps and
  scheduling are shared. A channel only decides how a `DigestItem[]` becomes a
  message. There is no parallel WhatsApp alert system.
- **Per-channel dedupe.** `AlertLog` is unique on
  `(userId, tenderId, channel, reason)`, so each channel has its own
  exactly-once guarantee: adding WhatsApp later doesn't re-spam email, and a
  failed WhatsApp send retries next tick without duplicating the email.
- **Two templates.** One tender → the _deadline warning_ (buyer, deadline, deep
  link to the tender). Several → the _digest_ (count, most urgent one, link to
  `/panel`).
- **Business+ only**, enforced through `src/lib/plan.ts` (`whatsappAlerts`) —
  checked on the settings write _and_ again at delivery time, on the
  **effective** plan, so a lapsed subscription degrades to email instead of
  silently ending someone's alerts.
- **Opt-in is explicit.** A number is only deliverable in `VERIFIED` state,
  reached by an OTP sent over the authentication template. The code is stored as
  an HMAC (peppered with `AUTH_SECRET`), expires, and has an attempt ceiling.

## 2. Delivery state — the hard part

WhatsApp delivery is asynchronous, reported over webhooks that arrive **out of
order**, **more than once**, and sometimes for messages we don't recognize.
`src/lib/whatsapp/deliveryState.ts` is a pure, unit-tested state machine:

| Rule                          | Behaviour                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monotonic success path        | `QUEUED → SENT → DELIVERED → READ`; a late `sent` after `read` is ignored                                                                                             |
| Idempotent                    | Applying the same event twice equals applying it once                                                                                                                 |
| Terminal failure              | `FAILED`/`UNDELIVERED` end the message; a later success event can't revive it                                                                                         |
| Delivery beats a late failure | A `failed` arriving after `delivered` is discarded — the handset already got it                                                                                       |
| Failure budget                | Only the _entry_ into a failure counts, so webhook retries can't inflate it                                                                                           |
| Error classification          | Permanent recipient errors (63003, 63024, 21211…) burn the whole budget at once; **sender-side** errors (63016 template problems, 20003 auth) never penalize the user |

After `WHATSAPP_MAX_DELIVERY_FAILURES` consecutive failures the user's
`whatsappStatus` becomes `FAILED`, their `alertChannel` falls back to `EMAIL`,
and the engine stops trying. A confirmed delivery resets the budget.

Opt-out: replying **BAJA / STOP / CANCELAR / SALIR / PARAR / BASTA /
UNSUBSCRIBE** sets `OPTED_OUT` immediately and falls back to email. **ALTA /
START / SUSCRIBIR** restores a number that is still on file.

## 3. What the owner must provide to go live

### 3.1 A WhatsApp Business sender

Twilio is the default (it is sandbox-testable without a Meta Business account).

1. Create a Twilio account → **Messaging → Try it out → Send a WhatsApp message**
   to reach the sandbox, or complete WhatsApp sender registration for a real
   number (requires a verified Meta Business Manager and a number not already on
   WhatsApp).
2. Collect: **Account SID**, **Auth Token**, and the **sender number in E.164**
   (the sandbox sender is `+14155238886`).

Alternative: 360dialog. `WHATSAPP_PROVIDER=dialog360` is reserved and validated,
but `Dialog360Provider` is an explicit not-implemented stub — implementing it is
one class in `src/lib/whatsapp/provider.ts` (send, signature, parse) and no
other file changes.

### 3.2 Three approved message templates

Every ParaOU alert is sent _outside_ the 24-hour customer-service window, so
each one must be a template Meta has approved. Submit them in Twilio's Content
Template Builder (or 360dialog's equivalent), in **Spanish (es)**, with these
exact names, categories and bodies — the code fills the numbered variables in
this order and nothing else:

| Env var                             | Name                     | Category       | Body / variables                                                                                         |
| ----------------------------------- | ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------- |
| `WHATSAPP_TEMPLATE_DIGEST_ID`       | `paraou_digest_es`       | UTILITY        | `{{1}}` empresa, `{{2}}` cantidad, `{{3}}` licitación más urgente, `{{4}}` cierre, `{{5}}` link a /panel |
| `WHATSAPP_TEMPLATE_DEADLINE_ID`     | `paraou_cierre_es`       | UTILITY        | `{{1}}` título, `{{2}}` comprador, `{{3}}` cierre + motivo, `{{4}}` link a la licitación                 |
| `WHATSAPP_TEMPLATE_VERIFICATION_ID` | `paraou_verificacion_es` | AUTHENTICATION | `{{1}}` código, `{{2}}` minutos de validez                                                               |

**The authoritative copy lives in `src/lib/whatsapp/templates.ts`** — copy the
`body` strings from there into the submission form verbatim, then paste the
returned template ids (Twilio Content SIDs, `HX…`) into the env vars above. A
missing id makes that one template fail loudly with a sender-side error; it
never silently degrades and never penalizes a user's number.

### 3.3 Webhook registration

Point **both** the status callback and the inbound-message webhook at:

```
https://<your-domain>/api/whatsapp/webhook
```

and set `WHATSAPP_WEBHOOK_URL` to that exact URL. Twilio signs the URL it
called, so behind Caddy/any reverse proxy the value must be the public one, not
what the app sees. The route rejects unsigned/mis-signed requests with 403 and
returns 503 when no credentials are configured — an unverifiable webhook is an
unauthenticated write to user state.

In Twilio: **Messaging → Settings → WhatsApp sandbox settings** (sandbox), or the
sender's **Messaging configuration** (production), for the inbound URL; the
status callback is sent per-message from `WHATSAPP_WEBHOOK_URL`.

### 3.4 Environment

```
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_WHATSAPP_FROM=+14155238886
WHATSAPP_WEBHOOK_URL=https://yourdomain/api/whatsapp/webhook
WHATSAPP_TEMPLATE_DIGEST_ID=HX…
WHATSAPP_TEMPLATE_DEADLINE_ID=HX…
WHATSAPP_TEMPLATE_VERIFICATION_ID=HX…
# optional tunables
WHATSAPP_MAX_DELIVERY_FAILURES=3
WHATSAPP_OTP_TTL_MINUTES=10
WHATSAPP_OTP_MAX_ATTEMPTS=5
```

All of it is optional: with none of it set, the dev transport logs the rendered
template instead of sending, exactly like `src/lib/email.ts` without a Resend
key (CLAUDE.md rule 2).

### 3.5 Go-live smoke test

1. Sandbox only: the test handset must first message the sandbox join code.
2. Set a test account to `plan=BUSINESS` (`/admin`, `manualBilling`).
3. `/cuenta` → **Alertas por WhatsApp** → enter the number → receive the code →
   verify → the channel picker unlocks "Correo y WhatsApp".
4. Seed an alertable tender, run the worker's digest job, confirm the message
   arrives and `WhatsappMessage.status` walks `SENT → DELIVERED → READ`.
5. Reply **BAJA** from the handset → `whatsappStatus` becomes `OPTED_OUT` and
   `alertChannel` falls back to `EMAIL`.

## 4. Costs (verify before launch)

Meta bills per 24-hour _conversation_, not per message, and prices vary by
country and category. Utility and authentication conversations originating in
Paraguay are cheap but **not free**; Twilio adds a per-message fee on top. Since
one digest per user per day is one conversation, budget roughly
`users × 30 × (Meta utility rate + Twilio fee)` per month and re-check the live
rate card before promising the channel to a large account. This is precisely why
the channel is Business+ gated rather than included everywhere.

## 5. Known limits of this build

- Never exercised against a live provider — only the dev transport and a fake
  `fetch` in tests.
- 360dialog is a stub.
- No media/interactive templates, no quick-reply buttons, and no per-profile
  channel preferences (channel + frequency remain per-user; F2's multi-profile
  switcher does not change that — alerts already aggregate every profile a user
  owns).
- Delivery status is stored and used for channel health, but not yet surfaced in
  `/admin`.
