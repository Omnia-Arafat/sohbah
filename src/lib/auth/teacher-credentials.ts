import { randomInt } from "node:crypto";
import { COUNTRIES } from "@/lib/phone";

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
 * Other keys the same phone line may have been registered under.
 *
 * The key is whatever digits were typed at registration, so one line exists in
 * several shapes across the staff table: "0538346008", "966538346008",
 * "0966538346008" (a '0' typed before the country code). Someone who signs in
 * with a different shape from the one she registered with is the same person,
 * so the sign-in looks for her under these too. The password still decides —
 * this only finds which account to check it against.
 *
 * The typed key itself is not included.
 */
export function phoneKeyCandidates(phoneKey: string): string[] {
  const core = phoneKey.replace(/^0+/, "");
  if (!core) return [];

  const out = new Set<string>([core, `0${core}`]);

  // Starts with a country code: add the national forms.
  for (const country of COUNTRIES) {
    if (!core.startsWith(country.dial)) continue;
    const national = core.slice(country.dial.length);
    if (!country.mobile.test(national)) continue;
    out.add(national);
    out.add(`0${national}`);
    out.add(`0${country.dial}${national}`);
  }

  // A national number: add the international forms for every country it fits.
  for (const country of COUNTRIES) {
    if (!country.mobile.test(core)) continue;
    out.add(`${country.dial}${core}`);
    out.add(`0${country.dial}${core}`);
  }

  out.delete(phoneKey);
  return [...out];
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
