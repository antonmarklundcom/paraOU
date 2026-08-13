/**
 * Phone normalization for the WhatsApp channel (PHASE-F1).
 *
 * Everything we store and send is E.164 with a leading "+". Paraguayan users
 * type their number the way they say it — `0981 123 456`, `981123456`,
 * `(0985) 123-456`, `+595 981 123456` — so the input is normalized to
 * `+595981123456` before it ever reaches the provider or the database. The
 * provider-specific `whatsapp:` prefix is a transport detail and lives only in
 * the provider adapters, never in a column.
 */

/** Paraguay. Other country codes are accepted only in explicit +CC form. */
const PY_CC = "595";
/** PY mobile subscriber numbers are 9 digits and start with 9 (096x, 098x, …). */
const PY_MOBILE = /^9\d{8}$/;

export class InvalidPhoneError extends Error {
  constructor(message = "Número de teléfono inválido") {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

/**
 * Normalizes user input to E.164, defaulting to Paraguay for local formats.
 * Throws InvalidPhoneError rather than returning null so callers can't forget
 * to check (the API route maps it to a 400).
 */
export function normalizePhone(input: string): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) throw new InvalidPhoneError();

  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) throw new InvalidPhoneError();

  // Explicit international form: trust it, sanity-check the length only.
  if (hadPlus || digits.startsWith("00")) {
    const intl = digits.startsWith("00") ? digits.slice(2) : digits;
    if (intl.length < 8 || intl.length > 15) throw new InvalidPhoneError();
    return `+${intl}`;
  }

  // 595…  → already carries the Paraguayan country code.
  if (digits.startsWith(PY_CC)) {
    const national = digits.slice(PY_CC.length);
    if (!PY_MOBILE.test(national)) throw new InvalidPhoneError();
    return `+${PY_CC}${national}`;
  }

  // 0981… → national trunk prefix.
  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  if (!PY_MOBILE.test(national)) throw new InvalidPhoneError();
  return `+${PY_CC}${national}`;
}

/** Best-effort normalization for values coming *from* a provider webhook. */
export function normalizeInboundPhone(input: string): string | null {
  const stripped = (input ?? "").replace(/^whatsapp:/i, "").trim();
  const digits = stripped.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** `+595981123456` → `+595 ••• ••3456` for display in /cuenta and logs. */
export function maskPhone(e164: string): string {
  if (e164.length < 5) return "•••";
  const cc = e164.slice(0, 4);
  const tail = e164.slice(-4);
  return `${cc} ••• ••${tail}`;
}
