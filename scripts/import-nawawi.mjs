/**
 * Imports الأربعون النووية into a curriculum, as `curriculum_units`.
 *
 * SOURCE: the published `ara-nawawi` / `eng-nawawi` editions of the open
 * hadith-api dataset. Forty-two hadiths — the collection is called "the
 * forty" and has forty-two, which is why the count below is not 40.
 *
 * NOTHING IS TYPED AND NOTHING IS COMPOSED. The same rule this project holds
 * for Quranic text applies here: the متن is written exactly as published, and
 * every field that is not in the source is left NULL rather than inferred.
 * `narrator` and `grade` are therefore empty — the chain is inside the متن and
 * this edition carries no grading, and neither is worth guessing at.
 *
 * One field is derived, mechanically: `source_book`, from the «رواه …»
 * sentence the text ends with, anchored to the end so a «رواه» occurring
 * mid-text is never mistaken for it. Five of the forty-two do not end that way
 * and are imported WITHOUT an attribution rather than with a guess.
 *
 * Titles are plain numbers, and the block above `sourceFrom` says why at
 * length. Existing units are updated in place and a title a person wrote is
 * never overwritten — the block above the write step says why that matters.
 *
 *     node scripts/import-nawawi.mjs            # preview, writes nothing
 *     node scripts/import-nawawi.mjs --apply
 */
import fs from "node:fs";

const AR_SOURCE =
  "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.json";
const EN_SOURCE =
  "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-nawawi.json";

const ACADEMY_SLUG = "sohbah";
const CIRCLE_TYPE = "hadith";
const APPLY = process.argv.includes("--apply");

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
const auth = { apikey: key, Authorization: `Bearer ${key}` };
const writeHeaders = {
  ...auth,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// --- Fetch -------------------------------------------------------------------

const [arabic, english] = await Promise.all(
  [AR_SOURCE, EN_SOURCE].map(async (source) => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${source} returned ${response.status}`);
    return response.json();
  }),
);

if (arabic.hadiths.length !== 42 || english.hadiths.length !== 42) {
  throw new Error(
    `expected 42 hadiths in each edition, got ` +
      `${arabic.hadiths.length} and ${english.hadiths.length}`,
  );
}

const englishByNumber = new Map(
  english.hadiths.map((h) => [h.hadithnumber, h.text]),
);

// --- Derive, mechanically ----------------------------------------------------

/**
 * Collapse whitespace and turn the edition's `<br>` into a real line break.
 *
 * Those two are presentation, not text. Everything else is left exactly as
 * published — including the square brackets the edition wraps its
 * attributions and reference numbers in, which are its apparatus and not
 * mine to remove.
 */
const tidy = (text) =>
  text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

/*
 * TITLES ARE NUMBERS, DELIBERATELY.
 *
 * This collection is universally indexed by the opening of its متن — «إنما
 * الأعمال بالنيات», «لا ضرر ولا ضرار» — and that would be the better label. I
 * tried twice to derive it: once from the quotation marks, once from the
 * reporting verb. Both produced a majority of wrong titles, because the
 * isnad, the matn and the attribution are not separated in this edition and
 * the chain often carries another «قال رسول الله ﷺ:» inside it. The first
 * attempt titled حديث ١٦ «.<br>[رَوَاهُ الْبُخَارِيُّ]».
 *
 * At that point the choice is between a plain number and a heuristic that is
 * wrong about scripture-adjacent text most of the time. A wrong title on a
 * hadith is worse than no title, and tuning the heuristic until the sample
 * looks right is how this project already produced ۩۩ and a duplicated
 * البسملة. So: numbers.
 *
 * The full متن is in `body` and the معلمة reads it when she picks the day's
 * lesson, so nothing is lost but convenience. Naming the forty-two is a human
 * judgement, it takes someone who knows the book about twenty minutes, and
 * /admin/curricula already has the screen for it.
 */

/**
 * The «رواه …» attribution, matched only as the text's LAST sentence.
 *
 * Anchored to the end so a «رواه» occurring mid-text is never mistaken for
 * the attribution, and capped in length so a runaway match is dropped rather
 * than stored.
 */
function sourceFrom(text) {
  const match = tidy(text).match(/(رَوَاهُ[^.]{3,120})\.?\s*$/u);
  return match ? tidy(match[1]) : null;
}

const units = arabic.hadiths.map((h) => ({
  position: h.hadithnumber,
  title_ar: `الحديث ${h.hadithnumber}`,
  title_en: `Hadith ${h.hadithnumber}`,
  body: tidy(h.text),
  // Left NULL on purpose. The English edition is a TRANSLATION and this field
  // is شرح — a scholar's commentary. Putting one where the other is expected
  // would misrepresent both, and the schema has no home for a translation.
  explanation: null,
  source_book: sourceFrom(tidy(h.text)),
  narrator: null, // inside the chain in `body`; not split out, not guessed
  grade: null, // this edition carries no grading for the collection
}));

// --- Checks ------------------------------------------------------------------

const problems = [];
const seen = new Set();
for (const unit of units) {
  if (!unit.body || unit.body.length < 40) {
    problems.push(`#${unit.position}: body too short (${unit.body?.length})`);
  }
  if (/<[a-z]/i.test(unit.body)) {
    problems.push(`#${unit.position}: markup left in the body`);
  }
  if (seen.has(unit.position)) problems.push(`#${unit.position}: duplicate position`);
  seen.add(unit.position);
}
if (problems.length) {
  console.error("refusing to write:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

// --- Preview -----------------------------------------------------------------

console.log(`${units.length} hadiths\n`);
for (const unit of units) {
  const opening = unit.body.replace(/\n/g, " ").slice(0, 70);
  console.log(`${String(unit.position).padStart(2)}. ${opening}…`);
}
const withSource = units.filter((u) => u.source_book).length;
console.log(
  `\nwith a «رواه» attribution: ${withSource} of ${units.length}` +
    ` — the rest are imported without one rather than with a guess`,
);

if (!APPLY) {
  console.log("\n(preview only — pass --apply to write)");
  process.exit(0);
}

// --- Write -------------------------------------------------------------------

const [academy] = await (
  await fetch(`${url}/rest/v1/academies?slug=eq.${ACADEMY_SLUG}&select=id`, {
    headers: auth,
  })
).json();
if (!academy) throw new Error(`academy ${ACADEMY_SLUG} not found`);

// Reuse the curriculum if it is already there, so running twice does not
// create a second copy of the same book.
const existing = await (
  await fetch(
    `${url}/rest/v1/curricula?academy_id=eq.${academy.id}` +
      `&circle_type=eq.${CIRCLE_TYPE}&name_ar=eq.${encodeURIComponent("الأربعون النووية")}&select=id`,
    { headers: auth },
  )
).json();

let curriculumId = existing[0]?.id;
if (!curriculumId) {
  const [created] = await (
    await fetch(`${url}/rest/v1/curricula`, {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify([
        {
          academy_id: academy.id,
          circle_type: CIRCLE_TYPE,
          name_ar: "الأربعون النووية",
          name_en: "The Forty Hadith of an-Nawawi",
          description:
            "اثنان وأربعون حديثًا جمعها الإمام النووي رحمه الله. النص من نسخة منشورة، غير معدَّل.",
          display_order: 1,
        },
      ]),
    })
  ).json();
  curriculumId = created.id;
  console.log(`created curriculum ${curriculumId}`);
} else {
  console.log(`reusing curriculum ${curriculumId}`);
}

/*
 * UPDATE IN PLACE, NEVER DELETE AND REINSERT.
 *
 * The first draft of this script deleted the curriculum's units and wrote
 * forty-two fresh ones. Checking the live data before running it showed what
 * that would have cost: position 1 already existed, with a title a person had
 * written — «الحديث الأول: إنما الأعمال بالنيات», which is better than
 * anything this script produces — and a quiz question pointing at that unit's
 * id. Deleting the row would have thrown the title away and, through
 * `on delete set null`, silently cut the question loose from its hadith.
 *
 * So an existing position is updated and its id survives, and A TITLE THAT
 * SOMEONE WROTE IS NEVER OVERWRITTEN. Only a title this script itself would
 * have produced — the plain «الحديث N» — is replaced.
 */
const current = await (
  await fetch(
    `${url}/rest/v1/curriculum_units?curriculum_id=eq.${curriculumId}` +
      `&select=id,position,title_ar`,
    { headers: auth },
  )
).json();
const byPosition = new Map(current.map((u) => [u.position, u]));

let inserted = 0;
let updated = 0;
const keptTitles = [];

for (const unit of units) {
  const existingUnit = byPosition.get(unit.position);

  if (!existingUnit) {
    const result = await fetch(`${url}/rest/v1/curriculum_units`, {
      method: "POST",
      headers: { ...writeHeaders, Prefer: "return=minimal" },
      body: JSON.stringify([{ ...unit, curriculum_id: curriculumId }]),
    });
    if (!result.ok) {
      throw new Error(
        `insert of #${unit.position} failed: ${result.status} ${await result.text()}`,
      );
    }
    inserted++;
    continue;
  }

  const humanTitle =
    existingUnit.title_ar && existingUnit.title_ar !== `الحديث ${unit.position}`;
  if (humanTitle) keptTitles.push(`#${unit.position} «${existingUnit.title_ar}»`);

  /*
   * An update FILLS, it does not blank.
   *
   * The first run of this overwrote position 1's «رواه البخاري ومسلم» — which
   * a person had entered and which is correct — with null, because this
   * edition's حديث ١ does not end in a «رواه» sentence for the extractor to
   * find. Not finding something is not the same as knowing it is absent, and
   * a patch built from "what I found" quietly asserts the difference.
   *
   * So a field the script did not derive is left out of the patch entirely
   * rather than sent as null.
   */
  const patch = { body: unit.body };
  if (unit.source_book) patch.source_book = unit.source_book;
  if (!humanTitle) {
    patch.title_ar = unit.title_ar;
    patch.title_en = unit.title_en;
  }

  const result = await fetch(
    `${url}/rest/v1/curriculum_units?id=eq.${existingUnit.id}`,
    {
      method: "PATCH",
      headers: { ...writeHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!result.ok) {
    throw new Error(
      `update of #${unit.position} failed: ${result.status} ${await result.text()}`,
    );
  }
  updated++;
}

console.log(`\ninserted ${inserted}, updated ${updated} in place`);
if (keptTitles.length) {
  console.log("kept these titles, which a person wrote:");
  for (const kept of keptTitles) console.log("  " + kept);
}


