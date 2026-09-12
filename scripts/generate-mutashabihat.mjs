/**
 * Finds the المتشابهات — pairs of ayat that are near-identical but differ in a
 * word or two — and writes them to `public.quran_mutashabihat`.
 *
 * WHY THIS IS THE DRILL WORTH BUILDING: it is the classic obstacle in serious
 * حفظ. «أَوَلَمْ يَرَوْا۟» in الروم against «أَوَلَمْ يَعْلَمُوٓا۟» in الزمر;
 * «مَا كَسَبُوا۟» in الزمر against «مَا عَمِلُوا۟» in الجاثية. Whole courses
 * and books are organised around them. And it is exactly the kind of thing a
 * machine can enumerate and a person cannot: it needs every ayah compared with
 * every other, which is why no معلمة writes this question bank by hand.
 *
 * HOW, without 19 million comparisons: ayat are first blocked by shared
 * four-word sequences, which reduces it to about nine thousand candidate
 * pairs, and only those are scored with a word-level edit distance.
 *
 * WHAT IT DOES NOT TOUCH: the text. Normalisation here is for COMPARISON ONLY
 * — marks stripped, alef and ya and ta-marbuta folded — and never leaves this
 * script. What is stored and shown is always the verbatim ayah from
 * `quran_ayahs`. The script asserts that folding preserves the word count, so
 * a word index computed on the folded form addresses the same word in the
 * real one; if that ever stops holding, it refuses to write.
 *
 *     node scripts/generate-mutashabihat.mjs            # report only
 *     node scripts/generate-mutashabihat.mjs --apply    # write the table
 */
import fs from "node:fs";

const MIN_SIMILARITY = 0.6;
const MIN_WORDS = 4;
/** A shingle shared by more than this many ayat is a refrain, not a confusion. */
const REFRAIN_CUTOFF = 40;

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

// --- Load --------------------------------------------------------------------

let ayahs = [];
for (let from = 0; from < 6236; from += 1000) {
  const page = await fetch(
    `${url}/rest/v1/quran_ayahs?select=surah,ayah,text&order=surah,ayah&offset=${from}&limit=1000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  ayahs = ayahs.concat(await page.json());
}
if (ayahs.length !== 6236) throw new Error(`expected 6236 ayahs, got ${ayahs.length}`);

// --- Fold, for comparison only ----------------------------------------------

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu;
const fold = (text) =>
  text
    .replace(MARKS, "")
    .replace(/[آأإٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Tokens, kept in step.
 *
 * An ayah's whitespace-separated tokens are not all words: the waqf signs
 * stand alone — «فِيهِ ۛ هُدًۭى» is three tokens, one of which is ۛ. Folding
 * empties those, so folding and then filtering would silently shift every
 * index after the first pause sign, and the blank would land on the wrong
 * word. The first version of this script did exactly that and the guard below
 * caught it at البقرة ٢ — nine tokens, seven words.
 *
 * So the two forms are built together and a token is dropped from BOTH or
 * neither. Index i then means the same word in each, by construction.
 */
const real = [];
const folded = [];
for (const ayah of ayahs) {
  const tokens = ayah.text.split(/\s+/).filter(Boolean);
  const keptReal = [];
  const keptFolded = [];
  for (const token of tokens) {
    const stripped = fold(token);
    if (!stripped) continue; // a lone waqf sign: punctuation, not a word
    keptReal.push(token);
    keptFolded.push(stripped);
  }
  real.push(keptReal);
  folded.push(keptFolded);
}

for (let i = 0; i < ayahs.length; i++) {
  if (real[i].length !== folded[i].length) {
    throw new Error(
      `refusing to write — token lists diverged at ` +
        `${ayahs[i].surah}:${ayahs[i].ayah} (${real[i].length} vs ${folded[i].length})`,
    );
  }
}
console.log("real and folded token lists line up for all 6236 ayahs");

// --- Candidate pairs ---------------------------------------------------------

const buckets = new Map();
folded.forEach((words, index) => {
  for (let at = 0; at + 4 <= words.length; at++) {
    const shingle = words.slice(at, at + 4).join(" ");
    if (!buckets.has(shingle)) buckets.set(shingle, []);
    buckets.get(shingle).push(index);
  }
});

const candidates = new Set();
for (const list of buckets.values()) {
  if (list.length < 2 || list.length > REFRAIN_CUTOFF) continue;
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) candidates.add(`${list[a]},${list[b]}`);
  }
}
console.log(`candidate pairs: ${candidates.size}`);

// --- Score, and find where they part ----------------------------------------

/** Word-level edit distance, with a backtrace so the first difference is known. */
function align(a, b) {
  const n = a.length;
  const m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }

  // Walk back to the earliest position where the two actually differ.
  let i = n;
  let j = m;
  let firstDiff = null;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      i--;
      j--;
      continue;
    }
    if (d[i][j] === d[i - 1][j - 1] + 1) firstDiff = { a: i - 1, b: j - 1 };
    else if (d[i][j] === d[i - 1][j] + 1) firstDiff = { a: i - 1, b: null };
    else firstDiff = { a: null, b: j - 1 };
    if (firstDiff.a !== null) i--;
    if (firstDiff.b !== null) j--;
  }

  return { similarity: 1 - d[n][m] / Math.max(n, m), firstDiff };
}

const rows = [];
for (const pairKey of candidates) {
  const [i, j] = pairKey.split(",").map(Number);
  if (folded[i].length < MIN_WORDS || folded[j].length < MIN_WORDS) continue;

  const { similarity, firstDiff } = align(folded[i], folded[j]);
  if (similarity < MIN_SIMILARITY || similarity >= 1) continue;

  // A difference that is a pure insertion on one side has no word to offer as
  // the wrong answer, so it cannot become a two-choice question.
  if (!firstDiff || firstDiff.a === null || firstDiff.b === null) continue;

  rows.push({
    a_surah: ayahs[i].surah,
    a_ayah: ayahs[i].ayah,
    b_surah: ayahs[j].surah,
    b_ayah: ayahs[j].ayah,
    similarity: Number(similarity.toFixed(3)),
    a_word_index: firstDiff.a,
    b_word_index: firstDiff.b,
    // The real words, verbatim from the real text, at the indexes the
    // invariant above guarantees line up.
    a_word: real[i][firstDiff.a],
    b_word: real[j][firstDiff.b],
  });
}

rows.sort((x, y) => y.similarity - x.similarity);

const crossSurah = rows.filter((r) => r.a_surah !== r.b_surah);
console.log(`\npairs kept: ${rows.length} (${crossSurah.length} across different surahs)`);
console.log("\nthe ten closest:");
for (const r of rows.slice(0, 10)) {
  console.log(
    `  ${r.similarity}  ${r.a_surah}:${r.a_ayah} «${r.a_word}»  ` +
      `vs  ${r.b_surah}:${r.b_ayah} «${r.b_word}»`,
  );
}

if (!APPLY) {
  console.log("\n(report only — pass --apply to write)");
  process.exit(0);
}

// --- Write -------------------------------------------------------------------

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

await fetch(`${url}/rest/v1/quran_mutashabihat?id=gte.0`, {
  method: "DELETE",
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

let written = 0;
for (let at = 0; at < rows.length; at += 500) {
  const slice = rows.slice(at, at + 500);
  const result = await fetch(`${url}/rest/v1/quran_mutashabihat`, {
    method: "POST",
    headers,
    body: JSON.stringify(slice),
  });
  if (!result.ok) {
    throw new Error(`insert failed at ${at}: ${result.status} ${await result.text()}`);
  }
  written += slice.length;
}
console.log(`\nwrote ${written} pairs`);
