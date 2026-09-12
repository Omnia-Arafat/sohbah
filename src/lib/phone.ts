/**
 * Country dial codes and per-country mobile validation.
 *
 * WHY THIS EXISTS: `students.phone_key` is digits-only, so the same line
 * registers twice when it is typed two different ways — "01141649134" and
 * "+20 11 41649134" produce different keys and the duplicate check never
 * fires. That happened in real data (أم وائل / Om wael, merged by hand on
 * 2026-09-12). The fix is to stop storing whatever was typed: every number now
 * goes in as E.164 (`+<dial><national>`), so one line is always one key.
 *
 * Students are not all Egyptian — the table holds Saudi, Yemeni, Sudanese and
 * Moroccan numbers — so the country is picked, never assumed, and each country
 * carries its own length and mobile-prefix rule. That is what stops the other
 * half of the mess: a 10-digit Egyptian number, or a Saudi mobile typed under
 * +20, is now rejected at the form instead of sitting in the table.
 */

export type Country = {
  iso: string;
  /** Dial code without '+'. */
  dial: string;
  flag: string;
  nameAr: string;
  nameEn: string;
  /**
   * The national significant number — what is left after the country code and
   * the trunk '0'. Anchored, so length is part of the rule.
   */
  mobile: RegExp;
  /** Shown as the input placeholder, in national form. */
  example: string;
};

/**
 * Ordered: the countries these academies actually serve first, then the rest of
 * the Arab world, then where families abroad tend to be. A student should find
 * her own country without scrolling.
 */
export const COUNTRIES: readonly Country[] = [
  { iso: "EG", dial: "20", flag: "🇪🇬", nameAr: "مصر", nameEn: "Egypt", mobile: /^1[0125]\d{8}$/, example: "10 1234 5678" },
  { iso: "SA", dial: "966", flag: "🇸🇦", nameAr: "السعودية", nameEn: "Saudi Arabia", mobile: /^5\d{8}$/, example: "50 123 4567" },
  { iso: "YE", dial: "967", flag: "🇾🇪", nameAr: "اليمن", nameEn: "Yemen", mobile: /^7[01378]\d{7}$/, example: "73 123 4567" },
  { iso: "SD", dial: "249", flag: "🇸🇩", nameAr: "السودان", nameEn: "Sudan", mobile: /^9\d{8}$/, example: "91 234 5678" },
  { iso: "MA", dial: "212", flag: "🇲🇦", nameAr: "المغرب", nameEn: "Morocco", mobile: /^[67]\d{8}$/, example: "66 123 4567" },
  { iso: "AE", dial: "971", flag: "🇦🇪", nameAr: "الإمارات", nameEn: "UAE", mobile: /^5[024568]\d{7}$/, example: "50 123 4567" },
  { iso: "KW", dial: "965", flag: "🇰🇼", nameAr: "الكويت", nameEn: "Kuwait", mobile: /^[569]\d{7}$/, example: "500 12345" },
  { iso: "QA", dial: "974", flag: "🇶🇦", nameAr: "قطر", nameEn: "Qatar", mobile: /^[3567]\d{7}$/, example: "3312 3456" },
  { iso: "BH", dial: "973", flag: "🇧🇭", nameAr: "البحرين", nameEn: "Bahrain", mobile: /^[36]\d{7}$/, example: "3600 1234" },
  { iso: "OM", dial: "968", flag: "🇴🇲", nameAr: "عُمان", nameEn: "Oman", mobile: /^[79]\d{7}$/, example: "9212 3456" },
  { iso: "JO", dial: "962", flag: "🇯🇴", nameAr: "الأردن", nameEn: "Jordan", mobile: /^7[789]\d{7}$/, example: "79 012 3456" },
  { iso: "PS", dial: "970", flag: "🇵🇸", nameAr: "فلسطين", nameEn: "Palestine", mobile: /^5[69]\d{7}$/, example: "59 123 4567" },
  { iso: "LB", dial: "961", flag: "🇱🇧", nameAr: "لبنان", nameEn: "Lebanon", mobile: /^(3\d{6}|7[0189]\d{6})$/, example: "71 123 456" },
  { iso: "SY", dial: "963", flag: "🇸🇾", nameAr: "سوريا", nameEn: "Syria", mobile: /^9\d{8}$/, example: "944 567 890" },
  { iso: "IQ", dial: "964", flag: "🇮🇶", nameAr: "العراق", nameEn: "Iraq", mobile: /^7[3-9]\d{8}$/, example: "770 123 4567" },
  { iso: "LY", dial: "218", flag: "🇱🇾", nameAr: "ليبيا", nameEn: "Libya", mobile: /^9[1-6]\d{7}$/, example: "91 234 5678" },
  { iso: "TN", dial: "216", flag: "🇹🇳", nameAr: "تونس", nameEn: "Tunisia", mobile: /^[2459]\d{7}$/, example: "20 123 456" },
  { iso: "DZ", dial: "213", flag: "🇩🇿", nameAr: "الجزائر", nameEn: "Algeria", mobile: /^[567]\d{8}$/, example: "551 23 45 67" },
  { iso: "MR", dial: "222", flag: "🇲🇷", nameAr: "موريتانيا", nameEn: "Mauritania", mobile: /^[234]\d{7}$/, example: "22 12 34 56" },
  { iso: "SO", dial: "252", flag: "🇸🇴", nameAr: "الصومال", nameEn: "Somalia", mobile: /^[6-9]\d{7,8}$/, example: "61 234 5678" },
  { iso: "DJ", dial: "253", flag: "🇩🇯", nameAr: "جيبوتي", nameEn: "Djibouti", mobile: /^77\d{6}$/, example: "77 12 34 56" },
  { iso: "KM", dial: "269", flag: "🇰🇲", nameAr: "جزر القمر", nameEn: "Comoros", mobile: /^3\d{6}$/, example: "321 2345" },
  { iso: "TR", dial: "90", flag: "🇹🇷", nameAr: "تركيا", nameEn: "Türkiye", mobile: /^5\d{9}$/, example: "532 123 4567" },
  { iso: "GB", dial: "44", flag: "🇬🇧", nameAr: "بريطانيا", nameEn: "UK", mobile: /^7\d{9}$/, example: "7400 123456" },
  { iso: "US", dial: "1", flag: "🇺🇸", nameAr: "أمريكا", nameEn: "USA", mobile: /^[2-9]\d{9}$/, example: "202 555 0134" },
  { iso: "CA", dial: "1", flag: "🇨🇦", nameAr: "كندا", nameEn: "Canada", mobile: /^[2-9]\d{9}$/, example: "416 555 0134" },
  { iso: "DE", dial: "49", flag: "🇩🇪", nameAr: "ألمانيا", nameEn: "Germany", mobile: /^1[5-7]\d{8,9}$/, example: "1512 3456789" },
  { iso: "FR", dial: "33", flag: "🇫🇷", nameAr: "فرنسا", nameEn: "France", mobile: /^[67]\d{8}$/, example: "6 12 34 56 78" },
  { iso: "NL", dial: "31", flag: "🇳🇱", nameAr: "هولندا", nameEn: "Netherlands", mobile: /^6\d{8}$/, example: "6 12345678" },
  { iso: "SE", dial: "46", flag: "🇸🇪", nameAr: "السويد", nameEn: "Sweden", mobile: /^7[0236]\d{7}$/, example: "70 123 45 67" },
] as const;

/** Most students are Egyptian; the picker opens there and they change it if not. */
export const DEFAULT_COUNTRY = "EG";

export function findCountry(iso: string | null | undefined): Country | null {
  if (!iso) return null;
  return COUNTRIES.find((c) => c.iso === iso) ?? null;
}

/**
 * Digits of the national number: punctuation out, and the trunk '0' that people
 * type out of habit ("0100…") dropped, since it is not part of E.164.
 */
export function toNationalDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

/** An `errors.*` key when the number is unusable, or null when it is valid. */
export function validatePhone(iso: string, raw: string): string | null {
  const country = findCountry(iso);
  if (!country) return "phoneCountryRequired";
  const national = toNationalDigits(raw);
  if (!national) return "phoneRequired";
  return country.mobile.test(national) ? null : "phoneInvalid";
}

/** The storage form. Call only after `validatePhone` returns null. */
export function toE164(iso: string, raw: string): string | null {
  const country = findCountry(iso);
  if (!country) return null;
  const national = toNationalDigits(raw);
  if (!national) return null;
  return `+${country.dial}${national}`;
}

/**
 * Split a stored number back into picker + input for an edit form.
 *
 * Longest dial code wins, so +20 never swallows +212. Legacy rows that predate
 * E.164 (no '+', or a country we do not list) come back with a null country and
 * the digits untouched — the معلمة then picks the country herself, which is the
 * only honest answer for a number like "05385539249".
 */
export function parseE164(phone: string | null | undefined): {
  iso: string | null;
  national: string;
} {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return { iso: null, national: "" };

  const digits = trimmed.replace(/^00/, "").replace(/\D/g, "");
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");

  if (international) {
    const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort(
      (a, b) => b.dial.length - a.dial.length,
    );
    for (const country of matches) {
      const national = digits.slice(country.dial.length);
      if (country.mobile.test(national)) return { iso: country.iso, national };
    }
    // Known code, unknown shape: keep the country so the معلمة only fixes the
    // digits, not both fields.
    if (matches[0]) {
      return { iso: matches[0].iso, national: digits.slice(matches[0].dial.length) };
    }
  }

  return { iso: null, national: digits.replace(/^0+/, "") };
}
