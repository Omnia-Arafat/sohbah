/**
 * Name matching that survives how Arabic is actually typed.
 *
 * Two things get in the way of a plain `includes()`:
 *
 * 1. Spelling. Nobody types the same name the same way twice — أسماء / اسماء,
 *    هدى / هدي, فاطمة / فاطمه. The letters that vary are folded, and the marks
 *    that do not change a word are stripped. This mirrors what `normalize_ar()`
 *    already does inside the database, so the two agree about what counts as
 *    the same name.
 *
 * 2. Titles. People type "معلمه وسام" when the name on file is "وسام لطفي",
 *    and circles are named things like "معلمه أسماء حمدي" or "§ أسماء إبراهيم §".
 *    Words that are a title rather than part of a name are dropped from BOTH
 *    sides, along with punctuation, so the two meet in the middle.
 */

const TASHKEEL = /[ً-ْٰـ]/g;

/**
 * Dropped from a search and from what is searched. Written in already-folded
 * form, since `normalizeArabic` runs first: ة is ه, أ/إ/آ are ا, ى is ي.
 */
const TITLES = new Set([
  "معلمه",
  "معلم",
  "مدرسه",
  "مدرس",
  "استاذه",
  "استاذ",
  "الاستاذه",
  "الاستاذ",
  "مشرفه",
  "مشرف",
  "حلقه",
  "حلقات",
  "ا",
  "م",
  "مس",
  "ام",
]);

export function normalizeArabic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ");
}

/** The words that actually identify a person, titles and symbols removed. */
function nameWords(value: string): string[] {
  return normalizeArabic(value)
    // "§ أسماء إبراهيم §", "أ/ منة", "م.سهير" — separators, not letters.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !TITLES.has(word));
}

/**
 * True when every meaningful word typed appears somewhere in the text, in any
 * order and as a partial word — so "وسا" finds "وسام لطفي", "معلمه وسام" finds
 * it too, and "احمد منه" finds "منة أحمد محمد".
 *
 * A search made only of titles ("معلمة") matches everything rather than
 * nothing: the person has not narrowed anything down yet.
 */
export function matchesSearch(text: string, query: string): boolean {
  const needles = nameWords(query);
  if (needles.length === 0) return true;

  const haystack = nameWords(text).join(" ");
  return needles.every((word) => haystack.includes(word));
}
