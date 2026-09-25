/**
 * How the stored Uthmani text is set on screen.
 *
 * Neither function changes a letter or a mark. They only undo two habits of
 * the plain-text edition that a printed mushaf does not have.
 */

/** The waqf signs: صلى ۖ قلى ۗ م ۘ لا ۙ ج ۚ and the معانقة ۛ. */
export const WAQF = /[ۖ-ۛ]/;

/**
 * Seat the سكتة and waqf marks the way the Madinah page does.
 *
 * The edition stores both after a SPACE — «عِوَجَا ۜ», «فِيهِ ۛ» — because in
 * plain text a mark needs something to sit on. A combining mark on an
 * ordinary space is drawn flat on the line, glued to the side of the word.
 * The two kinds then go different ways:
 *
 * - The سكتة (ۜ) belongs to a LETTER: the small سين of الكهف ١ sits over the
 *   alif of عِوَجَاۜ. It is joined onto the word.
 *
 * - A waqf sign belongs to the GAP between two words, above the line. It
 *   keeps its own space, made non-breaking so the sign can never start a
 *   line on its own; <QuranText> raises it into the gap.
 *
 * Normalise once, where the text is loaded. Word splitting must then be on
 * the plain space only (`splitWords`), so a sign travels with its word.
 */
export function attachMarks(text: string): string {
  return text
    .replace(/ +ۜ/g, "ۜ")
    .replace(/ +([ۖ-ۛ])/g, " $1");
}

/** Words of normalised text: a waqf sign stays with the word before it. */
export function splitWords(text: string): string[] {
  return text.split(/ +/).filter(Boolean);
}

/**
 * The البسملة's four words, letters only (بسم ٱلله ٱلرحمن ٱلرحيم). Compared
 * with the marks stripped, because the edition does not spell it identically
 * everywhere — التين and القدر carry a shadda on the ب — and whatever it
 * carries is what gets shown.
 */
const BASMALA_LETTERS =
  "بسم ٱلله " +
  "ٱلرحمن ٱلرحيم";

/**
 * Lift the البسملة off the front of a surah's first ayah.
 *
 * The edition opens ayah 1 of every surah with it, so drawn as stored it ran
 * straight into the ayah on the same line. The printed mushaf sets it on a
 * line of its own, unnumbered — except in الفاتحة, where it IS ayah 1 and
 * stays exactly where it is. التوبة has none, so nothing matches.
 *
 * This moves text, it never adds or respells it: `basmala + " " + rest` is
 * the ayah, byte for byte.
 */
export function splitBasmala(
  surah: number,
  ayah: number,
  text: string,
): { basmala: string | null; rest: string } {
  if (surah === 1 || ayah !== 1) return { basmala: null, rest: text };

  const words = splitWords(text);
  const opening = words.slice(0, 4).join(" ");
  if (words.length > 4 && opening.replace(/\p{M}/gu, "") === BASMALA_LETTERS) {
    return { basmala: opening, rest: words.slice(4).join(" ") };
  }
  return { basmala: null, rest: text };
}
