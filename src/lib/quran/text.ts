/**
 * How the stored Uthmani text is set on screen.
 *
 * Neither function changes a letter or a mark. They only undo two habits of
 * the plain-text edition that a printed mushaf does not have.
 */

/**
 * Put every waqf and سكتة mark back on the word it belongs to.
 *
 * The edition stores them after a SPACE — «عِوَجَا ۜ», «فِيهِ ۛ» — because in
 * plain text a mark needs something to sit on. A combining mark on a space has
 * no letter under it, so the browser draws it flat on the line, glued to the
 * side of the word: the small سين of الكهف ١ looked like a stray letter stuck
 * to the alif. On the word itself it rises above the last letter, where the
 * Madinah page prints it. The space AFTER the mark is kept, so the gap to the
 * next word is unchanged.
 *
 * Normalise once, where the text is loaded, so every consumer — the page, the
 * word-by-word drills — sees a mark as part of a word and never as a word.
 */
export function attachMarks(text: string): string {
  return text.replace(/ +(\p{M})/gu, "$1");
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

  const words = text.split(" ");
  const opening = words.slice(0, 4).join(" ");
  if (words.length > 4 && opening.replace(/\p{M}/gu, "") === BASMALA_LETTERS) {
    return { basmala: opening, rest: words.slice(4).join(" ") };
  }
  return { basmala: null, rest: text };
}
