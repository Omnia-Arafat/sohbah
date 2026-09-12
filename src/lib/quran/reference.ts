import {
  JUZ_COUNT,
  JUZ_STARTS,
  PAGE_COUNT,
  PAGE_STARTS,
  type StartRef,
} from "./structure";
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

// =============================================================================
// Where a reference sits in the mushaf
// =============================================================================

/**
 * The boundary tables as absolute ayah numbers, so "which page is this?"
 * becomes a binary search over 604 integers instead of a scan over pairs.
 */
const asAbsolute = (starts: readonly StartRef[]): readonly number[] =>
  starts.map(([surah, ayah]) => absoluteAyah({ surah, ayah }));

const JUZ_ABS = asAbsolute(JUZ_STARTS);
const PAGE_ABS = asAbsolute(PAGE_STARTS);

/** The index of the last boundary at or before `position`, 1-based. */
function containing(bounds: readonly number[], position: number): number {
  let low = 0;
  let high = bounds.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bounds[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** Which جزء a reference falls in, 1–30. */
export function juzOf(ref: AyahRef): number {
  return containing(JUZ_ABS, absoluteAyah(ref));
}

/** Which mushaf page a reference falls on, 1–604 (King Fahd layout). */
export function pageOf(ref: AyahRef): number {
  return containing(PAGE_ABS, absoluteAyah(ref));
}

/** Every جزء a range touches, in order. */
export function juzSpan(range: AyahRange): number[] {
  const first = juzOf(range.from);
  const last = juzOf(range.to);
  const span: number[] = [];
  for (let juz = first; juz <= last; juz++) span.push(juz);
  return span;
}

/** How many ayat جزء n holds — the denominator for "how much of it is done". */
export function juzLength(juz: number): number {
  const start = JUZ_ABS[juz - 1];
  const end = juz < JUZ_COUNT ? JUZ_ABS[juz] : absoluteAyah({ surah: 114, ayah: 6 }) + 1;
  return end - start;
}

/** How many ayat of جزء n a range covers. Zero when they do not overlap. */
export function overlapWithJuz(range: AyahRange, juz: number): number {
  const juzStart = JUZ_ABS[juz - 1];
  const juzEnd = juz < JUZ_COUNT ? JUZ_ABS[juz] - 1 : absoluteAyah({ surah: 114, ayah: 6 });
  const from = Math.max(absoluteAyah(range.from), juzStart);
  const to = Math.min(absoluteAyah(range.to), juzEnd);
  return Math.max(0, to - from + 1);
}

/**
 * A count of ayat expressed the way a حافظة talks about it: "٧ أجزاء و١٢
 * صفحة", not "1440 آية".
 *
 * Approximate by construction — a جزء is twenty pages and pages are not equal
 * in ayat — and that is the point: she is being told roughly how much she
 * holds, and a number to three digits would suggest a precision the underlying
 * record does not have.
 */
export function asJuzAndPages(ayahs: number): { juz: number; pages: number } {
  const totalAyahs = absoluteAyah({ surah: 114, ayah: 6 });
  // Divided by the real averages — 6236/30 and 6236/604 — not by "20 pages to
  // a جزء". The mushaf has 604 pages, so a جزء is 20.13 of them, and rounding
  // that to 20 makes the whole Quran come out as "٣٠ جزءًا و٤ صفحات".
  const perJuz = totalAyahs / JUZ_COUNT;
  const perPage = totalAyahs / PAGE_COUNT;
  const juz = Math.floor(ayahs / perJuz);
  const pages = Math.round((ayahs - juz * perJuz) / perPage);
  return { juz, pages };
}
