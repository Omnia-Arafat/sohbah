/**
 * Writes the mushaf into the repo as a static asset.
 *
 * Until now the text lived only in `quran_ayahs` and every page view was a
 * round trip to Supabase. That is one query for something that has not changed
 * in fourteen centuries and will not change again — and it is why a page the
 * reader has not already visited cannot be opened without a signal.
 *
 * The shape is chosen to be small rather than convenient: one array per page,
 * one array per ayah, positional fields. Field names repeated 6236 times cost
 * more than the text does.
 *
 *   page -> [ [surah, ayah, juz, sajdaFlag, startsSurahFlag, text], ... ]
 *
 * Run with: node scripts/export-quran.mjs
 */
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// PostgREST caps a response, so the table is walked in slices rather than
// asked for all 6236 rows at once.
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/quran_ayahs?select=surah,ayah,page,juz,sajda,text` +
      `&order=page.asc,surah.asc,ayah.asc&limit=1000&offset=${offset}`,
    { headers: HEADERS },
  );
  const batch = await res.json();
  if (!Array.isArray(batch)) throw new Error(JSON.stringify(batch));
  rows.push(...batch);
  if (batch.length < 1000) break;
}

if (rows.length === 0) throw new Error("no ayahs returned");

// `starts_surah` is derived, not stored: an ayah starts a surah when it is
// ayah 1. `mushaf_page()` computes it the same way.
const pages = {};
for (const r of rows) {
  (pages[r.page] ||= []).push([
    r.surah,
    r.ayah,
    r.juz,
    r.sajda ? 1 : 0,
    r.ayah === 1 ? 1 : 0,
    r.text,
  ]);
}

const pageNumbers = Object.keys(pages).map(Number).sort((a, b) => a - b);
const missing = [];
for (let p = 1; p <= 604; p++) if (!pages[p]) missing.push(p);

const out = path.join("public", "quran", "pages.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pages));

const bytes = fs.statSync(out).size;
console.log(`ayahs        : ${rows.length}`);
console.log(`pages        : ${pageNumbers.length} (${pageNumbers[0]}..${pageNumbers.at(-1)})`);
console.log(`missing pages: ${missing.length ? missing.join(", ") : "none"}`);
console.log(`written      : ${out}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
