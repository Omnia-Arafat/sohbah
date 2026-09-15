/**
 * Builds the pool the home screen's «كمّلي الآية» card draws from.
 *
 * WHY A POOL AND NOT THE REAL THING. The card is a teaser: it shows one cue to
 * make a student want to open اختبري حفظك, where the actual drill lives. It
 * must not cost a database round trip on every visit to the front door, and it
 * must work with no connection — so it ships as a module, small enough to sit
 * in the page's chunk.
 *
 * THE RULES ARE COPIED, NOT INVENTED. A teaser that splits an ayah differently
 * from the drill would be advertising something the app does not do, so the
 * three rules in `buildQuestions()` are applied here verbatim:
 *
 *   * at least six words — a three-word ayah cannot be completed, the cue
 *     would be the whole thing;
 *   * never ayah 1 — in this edition it opens with the البسملة, which is the
 *     same cue for 112 surahs and identifies none of them;
 *   * the cue is the first third, at a word boundary, never fewer than two
 *     words.
 *
 * SCOPED TO جزء عم. The pool is what a student is most likely to actually
 * know: a cue from البقرة would stop most of them rather than tempt them, and
 * a teaser nobody can answer teaches people to ignore the card.
 *
 * Run with: node scripts/build-teasers.mjs
 */
import fs from "node:fs";
import path from "node:path";

const pages = JSON.parse(fs.readFileSync("public/quran/pages.json", "utf8"));

/** Positional, as written by scripts/export-quran.mjs. */
const SURAH = 0;
const AYAH = 1;
const JUZ = 2;
const TEXT = 5;

const wordsOf = (text) => text.split(/\s+/).filter(Boolean);

const teasers = [];
for (const rows of Object.values(pages)) {
  for (const row of rows) {
    if (row[JUZ] !== 30) continue;
    if (row[AYAH] === 1 && row[SURAH] !== 9) continue;

    const words = wordsOf(row[TEXT]);
    if (words.length < 6) continue;

    const cut = Math.max(2, Math.round(words.length / 3));
    const cue = words.slice(0, cut).join(" ");

    /*
      One rule the drill does not have: a cue has to be worth reading.

      The drill's minimum is two words, which inside a ten-question test is
      fine — «هَلْ فِى …» is a fair question when she has chosen to be tested.
      On the home screen it is an advertisement, and «هَلْ فِى …» advertises
      nothing: it is not recognisable enough to make anyone want to answer it.
      So the pool is the drill's questions filtered to the ones that read as a
      phrase — a subset, never anything the drill would not also ask.
    */
    if (cue.length < 20) continue;

    teasers.push({ surah: row[SURAH], ayah: row[AYAH], cue });
  }
}

if (teasers.length < 30) {
  throw new Error(`only ${teasers.length} teasers — the rules are too strict`);
}

const out = path.join("src", "lib", "quran", "teasers.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(teasers) + "\n");

console.log(`teasers : ${teasers.length} (جزء عم)`);
console.log(`shortest: ${Math.min(...teasers.map((x) => x.cue.length))} chars`);
console.log(`longest : ${Math.max(...teasers.map((x) => x.cue.length))} chars`);
console.log(`written : ${out}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
