import { SURAHS, surahByNumber, type Surah } from "./surahs";

/**
 * One end of a recitation: a surah and an ayah inside it.
 */
export type AyahRef = {
  surah: number;
  ayah: number;
};

export type AyahRange = {
  from: AyahRef;
  to: AyahRef;
};

/**
 * Running total of ayat BEFORE each surah, so any reference can be turned
 * into a single number and two references compared or subtracted.
 *
 * Built once from the generated table rather than written out: the day a
 * count is corrected upstream, this follows without anyone remembering to.
 */
const AYAT_BEFORE: readonly number[] = (() => {
  const offsets: number[] = [];
  let total = 0;
  for (const surah of SURAHS) {
    offsets.push(total);
    total += surah.ayahs;
  }
  return offsets;
})();

/** A reference as its absolute position in the mushaf, 1-based. */
export function absoluteAyah(ref: AyahRef): number {
  const before = AYAT_BEFORE[ref.surah - 1];
  if (before === undefined) return 0;
  return before + ref.ayah;
}

/** How many ayat a range covers, both ends included. */
export function ayahCount(range: AyahRange): number {
  return absoluteAyah(range.to) - absoluteAyah(range.from) + 1;
}

/** True when the range runs forward — the same rule the DB constraint holds. */
export function isForward(range: AyahRange): boolean {
  return absoluteAyah(range.to) >= absoluteAyah(range.from);
}

/** Keeps an ayah inside its surah, so a picker can never offer آية ١٢٠ of الكهف. */
export function clampAyah(ref: AyahRef): AyahRef {
  const surah = surahByNumber(ref.surah);
  if (!surah) return ref;
  return { surah: ref.surah, ayah: Math.min(Math.max(1, ref.ayah), surah.ayahs) };
}

/**
 * The ayah after this one, rolling into the next surah at the end.
 *
 * This is the prefill for a student's next turn: she almost always continues
 * from where she stopped, and that should cost the معلمة no taps.
 * The last ayah of الناس has no successor, so it stays put.
 */
export function nextAyah(ref: AyahRef): AyahRef {
  const surah = surahByNumber(ref.surah);
  if (!surah) return ref;
  if (ref.ayah < surah.ayahs) return { surah: ref.surah, ayah: ref.ayah + 1 };
  if (ref.surah < SURAHS.length) return { surah: ref.surah + 1, ayah: 1 };
  return ref;
}

/**
 * "الكَهۡفِ 11". The surah name is Uthmani orthography straight from the
 * generated table — never re-spelled here.
 *
 * Numbers are left as plain digits, which is what the rest of the app does
 * (the queue badge, the session counters). Formatting them Arabic-Indic in
 * this one place would make the same number look different on two halves of
 * the same screen.
 */
export function formatRef(ref: AyahRef, locale: string): string {
  const surah = surahByNumber(ref.surah);
  if (!surah) return String(ref.ayah);
  return `${surahName(surah, locale)} ${ref.ayah}`;
}

/**
 * A whole range in one line: "الكَهۡفِ 11 — 26" when both ends share a surah,
 * "الكَهۡفِ 105 — مَرۡيَمَ 12" when they do not.
 */
export function formatRange(range: AyahRange, locale: string): string {
  if (range.from.surah === range.to.surah) {
    const surah = surahByNumber(range.from.surah);
    const name = surah ? surahName(surah, locale) : "";
    return `${name} ${range.from.ayah} — ${range.to.ayah}`;
  }
  return `${formatRef(range.from, locale)} — ${formatRef(range.to, locale)}`;
}

function surahName(surah: Surah, locale: string): string {
  return locale === "ar" ? surah.name : surah.englishName;
}
