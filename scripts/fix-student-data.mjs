/**
 * One-off cleanup of the sohbah student table, 2026-09-13.
 *
 * Three jobs, in order:
 *   1. Names — strip decoration and normalise the Persian ی to the Arabic ي,
 *      which otherwise makes a name unfindable by search.
 *   2. Phones — rewrite every number as E.164 so `phone_key` is canonical and
 *      the new country picker can round-trip it (see src/lib/phone.ts).
 *      A number whose country cannot be told from its own digits is REPORTED,
 *      never guessed.
 *   3. One merge — أم كريم and سيدة محمد الصادق are one woman; the kunya row
 *      keeps the attendance and takes the real name.
 *
 * Dry run by default. Apply with:  node scripts/fix-student-data.mjs --apply
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SOHBAH = "1bbbeae7-9479-48a0-a67f-6075ffb8ad10";
const APPLY = process.argv.includes("--apply");
const tag = APPLY ? "✓" : "[معاينة]";

// --- 1. Names ---------------------------------------------------------------
// Decorations (♡), repeated spaces, and a stray honorific initial. The Persian
// ی (U+06CC) and ک (U+06A9) look identical to the Arabic letters but are
// different code points, so a name carrying them never matches a search.
function cleanName(name) {
  return name
    .replace(/ی/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[^ء-ي٠-٩a-zA-Z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^م\s+(?=\S)/, "")
    .trim();
}

// --- 2. Phones --------------------------------------------------------------
// Each rule matches a shape that identifies its country on its own. Anything
// else is left alone and printed at the end for a human to decide.
const RULES = [
  [/^201[0125]\d{8}$/, (d) => `+${d}`, "مصر"],
  [/^01[0125]\d{8}$/, (d) => `+20${d.slice(1)}`, "مصر (محلي)"],
  [/^9665\d{8}$/, (d) => `+${d}`, "السعودية"],
  [/^09665\d{8}$/, (d) => `+${d.slice(1)}`, "السعودية (صفر زائد)"],
  [/^05\d{8}$/, (d) => `+966${d.slice(1)}`, "السعودية (محلي)"],
  [/^9677[01378]\d{7}$/, (d) => `+${d}`, "اليمن"],
  [/^7[01378]\d{7}$/, (d) => `+967${d}`, "اليمن (بدون كود)"],
  [/^249[19]\d{8}$/, (d) => `+${d}`, "السودان"],
  [/^06\d{8}$/, (d) => `+212${d.slice(1)}`, "المغرب (محلي)"],
  [/^212[67]\d{8}$/, (d) => `+${d}`, "المغرب"],
];

function proposePhone(raw) {
  const digits = (raw ?? "").replace(/^00/, "").replace(/\D/g, "");
  if (!digits) return null;
  for (const [shape, build, why] of RULES) {
    if (shape.test(digits)) return { phone: build(digits), why };
  }
  return null;
}

// --- 2b. Numbers the user supplied by hand ----------------------------------
// Rows with no number at all, where she has since asked the student. Keyed by
// id prefix rather than name, because several of these names repeat.
const SUPPLIED = [
  ["fd7a3308", "+201069835949", "رحمه يونس"],
  ["12053f56", "+201551353791", "عبير محمد عبد المنعم"],
];

// --- 3. The merge -----------------------------------------------------------
// أم كريم (18 جلسة) is the row that survives; it takes the real name and the
// number the user confirmed. The other two rows carry no attendance.
const MERGE = {
  keep: "f6c6781a",
  name: "سيدة محمد الصادق",
  phone: "+201012154836",
  drop: ["dbabb299", "65bcbb44"],
};

const { data: students, error } = await db
  .from("students")
  .select("*")
  .eq("academy_id", SOHBAH)
  .order("created_at");
if (error) throw error;
const byPrefix = (p) => students.find((s) => s.id.startsWith(p));

console.log("=== ١. الأسماء ===");
for (const s of students) {
  const cleaned = cleanName(s.name);
  if (cleaned === s.name || !cleaned) continue;
  console.log(`${tag} "${s.name}" ← "${cleaned}"`);
  if (APPLY) {
    const { error: e } = await db.from("students").update({ name: cleaned }).eq("id", s.id);
    if (e) throw e;
  }
}

console.log("\n=== ٢. الأرقام ===");
const unresolved = [];
let fixed = 0;
for (const s of students) {
  if (!s.phone) continue;
  const proposal = proposePhone(s.phone);
  if (!proposal) {
    unresolved.push(s);
    continue;
  }
  if (proposal.phone === s.phone) continue;
  console.log(`${tag} ${s.name.trim()}: ${s.phone} ← ${proposal.phone}  (${proposal.why})`);
  fixed++;
  if (APPLY) {
    const { error: e } = await db.from("students").update({ phone: proposal.phone }).eq("id", s.id);
    if (e) throw e;
  }
}

console.log("\n=== ٢ب. أرقام وصلت من المستخدمة ===");
for (const [prefix, phone, label] of SUPPLIED) {
  const s = byPrefix(prefix);
  if (!s) {
    console.log(`!! ${label} (${prefix}) مش موجودة — تخطّي`);
    continue;
  }
  if (s.phone) {
    console.log(`!! ${s.name.trim()} بقى عندها رقم بالفعل (${s.phone}) — تخطّي`);
    continue;
  }
  console.log(`${tag} ${s.name.trim()}: (بدون رقم) ← ${phone}`);
  if (APPLY) {
    const { error: e } = await db.from("students").update({ phone }).eq("id", s.id);
    if (e) throw e;
  }
}

console.log("\n=== ٣. دمج أم كريم / سيدة محمد الصادق ===");
const keep = byPrefix(MERGE.keep);
if (!keep) {
  console.log("!! الصف الأساسي مش موجود — تخطّي");
} else {
  const removed = [];
  for (const p of MERGE.drop) {
    const drop = byPrefix(p);
    if (!drop) {
      console.log(`!! المكرر ${p} مش موجود — تخطّي`);
      continue;
    }
    const { data: keepRecs } = await db
      .from("attendance_records")
      .select("circle_id, session_date")
      .eq("student_id", keep.id);
    const taken = new Set((keepRecs ?? []).map((r) => `${r.circle_id}|${r.session_date}`));
    const { data: dupRecs } = await db.from("attendance_records").select("*").eq("student_id", drop.id);
    for (const r of dupRecs ?? []) {
      const clash = taken.has(`${r.circle_id}|${r.session_date}`);
      if (!APPLY) continue;
      const { error: e } = clash
        ? await db.from("attendance_records").delete().eq("id", r.id)
        : await db.from("attendance_records").update({ student_id: keep.id }).eq("id", r.id);
      if (e) throw e;
      if (!clash) taken.add(`${r.circle_id}|${r.session_date}`);
    }
    console.log(`${tag} اتشال "${drop.name.trim()}" (${dupRecs?.length ?? 0} صف حضور)`);
    if (APPLY) {
      removed.push(drop);
      const { error: e } = await db.from("students").delete().eq("id", drop.id).eq("academy_id", SOHBAH);
      if (e) throw e;
    }
  }
  console.log(`${tag} "${keep.name}" ← "${MERGE.name}" · ${MERGE.phone}`);
  if (APPLY) {
    const { error: e } = await db
      .from("students")
      .update({ name: MERGE.name, phone: MERGE.phone })
      .eq("id", keep.id);
    if (e) throw e;
    if (removed.length) {
      fs.writeFileSync("scripts/deleted-students-3.json", JSON.stringify(removed, null, 1));
    }
  }
}

console.log("\n=== أرقام محتاجة قرارك (اتسابت زي ما هي) ===");
for (const s of unresolved) {
  const d = (s.phone ?? "").replace(/\D/g, "");
  console.log(`  ${s.name.trim()}: ${s.phone}  (${d.length} رقم)`);
}

// Re-read rather than reasoning from the list above: after --apply the table has
// moved, and what she actually wants to know is how many students are still
// unreachable.
const { data: after } = await db
  .from("students")
  .select("id, name, phone")
  .eq("academy_id", SOHBAH);
const stillMissing = (after ?? [])
  .filter((s) => !s.phone || !String(s.phone).trim())
  // On a dry run nothing was written, so discount the numbers this run would
  // have filled in — otherwise the count reads worse than the outcome.
  .filter((s) => APPLY || !SUPPLIED.some(([prefix]) => s.id.startsWith(prefix)));

console.log("\n=== لسه من غير رقم ===");
for (const s of stillMissing) console.log(`  ${s.name.trim()}`);
console.log(
  `\n${APPLY ? "تم" : "معاينة"}: ${fixed} رقم يتصلح · ${SUPPLIED.length} رقم وصل منك · ` +
    `${unresolved.length} محتاج قرار · ${stillMissing.length} لسه بدون رقم` +
    (APPLY ? "" : "\nشغّليه بـ --apply لما تخلصي تجميع الأرقام."),
);
