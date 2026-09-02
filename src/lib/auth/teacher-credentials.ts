import { randomInt } from "node:crypto";

/**
 * Teachers sign in with a phone number and a password they chose. Supabase Auth
 * needs an email address for that, and teachers do not give one, so each
 * account gets a synthetic address derived from the phone number.
 *
 * The address is an implementation detail: the teacher never sees it, never
 * types it, and it can never receive mail. The password is genuinely theirs —
 * nothing here derives or stores it.
 */

/** Mirrors `public.normalize_phone()`. */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/^00/, "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * `.invalid` is reserved by RFC 2606 and can never be a real domain, so these
 * addresses cannot collide with a real inbox or be used to mail anybody.
 */
export function credentialEmail(phoneKey: string, academySlug: string): string {
  return `t${phoneKey}@${academySlug}.teachers.invalid`;
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * A temporary password for a supervisor to pass on when someone is locked out.
 *
 * Digits and letters only, with the easily-confused characters removed — this
 * gets read off a screen and typed into a phone, often dictated over WhatsApp,
 * so `0/O` and `1/l/I` would cause more lockouts than they solve.
 */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[randomInt(alphabet.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
