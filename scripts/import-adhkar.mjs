/**
 * Brings أذكار الصباح والمساء into the repo as a checked-in module.
 *
 * SOURCE: Seen-Arabic/Morning-And-Evening-Adhkar-DB, MIT licensed, which
 * compiles حصن المسلم (سعيد بن علي بن وهف القحطاني) with its شرح, رواء الظمآن
 * for الشيخ محمد إسماعيل المقدم, and sunnah.com. It was chosen over the
 * fuller 133-chapter datasets for one reason: its تشكيل is more careful.
 * Compared on the same text — سيد الاستغفار — it writes «عَبْدُكَ» where the
 * others write «عَبْدُك», and it does not drop the شدّة from «الَّذِي», which
 * the 302-dhikr dataset does in 22 of 29 places. Students here are حافظات and
 * read تشكيل closely; the fuller book can follow once it has been proofread.
 *
 * Bundled as a module rather than fetched from /public. The mushaf taught us
 * that a separate file is only offline if something caches it, and at 60KB
 * this is small enough to live in a chunk that is offline by construction.
 *
 * DROPPED: `audio` (external links to islamway — useless offline and not ours
 * to depend on) and the vocabulary glosses, which are longer than the أذكار
 * they explain and belong in a reference, not a daily screen.
 *
 * Run with: node scripts/import-adhkar.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB/main/ar.json";

/** 0 = both, 1 = morning only, 2 = evening only. From the source's README. */
const BOTH = 0;
const MORNING_ONLY = 1;
const EVENING_ONLY = 2;

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`source returned ${res.status}`);
const raw = await res.json();
const rows = Array.isArray(raw) ? raw : Object.values(raw)[0];

if (!Array.isArray(rows) || rows.length === 0) throw new Error("no rows");

const adhkar = rows
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((row) => {
    const entry = {
      id: row.order,
      text: String(row.content).trim(),
      count: Number(row.count),
      // "مَرَّةٌ وَاحِدَةٌ", "ثَلاثُ مَرَّاتٍ" — the source writes these out, and
      // reading them beats deriving "3 مرات" from the number.
      countLabel: String(row.count_description ?? "").trim(),
      // The تخريج. Never optional: a dhikr without one has no business being
      // shown to somebody memorising the Qur'an.
      source: String(row.source ?? "").trim(),
      morning: row.type === BOTH || row.type === MORNING_ONLY,
      evening: row.type === BOTH || row.type === EVENING_ONLY,
    };
    const fadl = String(row.fadl ?? "").trim();
    if (fadl) entry.fadl = fadl;
    return entry;
  });

// --- Checks, because this is religious text and a silent import is not enough
const problems = [];
for (const d of adhkar) {
  if (!d.text) problems.push(`#${d.id}: empty text`);
  if (!Number.isInteger(d.count) || d.count < 1) problems.push(`#${d.id}: bad count ${d.count}`);
  if (!d.source) problems.push(`#${d.id}: no تخريج`);
  if (!d.morning && !d.evening) problems.push(`#${d.id}: belongs to neither time`);
  // Arabic letters with no diacritics at all would mean the تشكيل was lost.
  if (!/[ً-ْ]/.test(d.text)) problems.push(`#${d.id}: no تشكيل`);
}
if (problems.length) {
  console.error("REFUSING TO WRITE:");
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}

const out = path.join("src", "lib", "adhkar", "morning-evening.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(adhkar, null, 1) + "\n");

const morning = adhkar.filter((d) => d.morning).length;
const evening = adhkar.filter((d) => d.evening).length;
console.log(`أذكار     : ${adhkar.length}`);
console.log(`الصباح    : ${morning}`);
console.log(`المساء    : ${evening}`);
console.log(`عليها فضل : ${adhkar.filter((d) => d.fadl).length}`);
console.log(`عليها تخريج: ${adhkar.filter((d) => d.source).length}/${adhkar.length}`);
console.log(`written   : ${out}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
