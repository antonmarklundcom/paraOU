/**
 * WhatsApp alert channel (PHASE-F1). Barrel — import from `@/lib/whatsapp`
 * rather than reaching into the individual modules.
 *
 *  provider.ts       transport abstraction (Twilio default, dev transport, 360dialog stub)
 *  templates.ts      the pre-approved Meta templates and their variables
 *  deliveryState.ts  the pure async-delivery state machine
 *  outbox.ts         persistence, webhook folding, opt-out/failure health
 *  verification.ts   the OTP opt-in flow
 *  phone.ts          E.164 normalization (Paraguay-first)
 *
 * Channel *selection* (who gets WhatsApp vs. email) lives one level up in
 * `src/lib/alerts/channels.ts`, because it is an alert-engine concern.
 */

export * from "./phone.js";
export * from "./templates.js";
export * from "./deliveryState.js";
export * from "./provider.js";
export * from "./outbox.js";
export * from "./verification.js";
