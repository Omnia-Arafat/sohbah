// Students with more than one row under the same name and the same number,
// merged on 2026-09-29 at the academy's request:
//   أم وائل / ام وائل, ام عمار / أم عمار, امجاد الحربي (four rows, two of them
//   filed under the men's side).
//
// For each person the row that stays is the one with the most history, then
// the oldest; امجاد stays on the women's side. Everything that points at a
// dropped row is moved to the kept one first, and a row is deleted only when
// nothing points at it any more. ام ياسين is not here: her two rows have
// different numbers and are two people.
//
//   node scripts/merge-students-2026-09-29.mjs          # dry run
//   node scripts/merge-students-2026-09-29.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOHBAH = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10';
const APPLY = process.argv.includes('--apply');

// Every column with a foreign key to students.
const REFS = [
  ['attendance_records', 'student_id'], ['quiz_attempts', 'student_id'],
  ['student_unit_progress', 'student_id'], ['recitation_logs', 'student_id'],
  ['track_enrollments', 'student_id'], ['track_recitations', 'student_id'],
  ['track_recitations', 'listener_student_id'], ['track_alerts', 'student_id'],
  ['track_day_reports', 'student_id'], ['track_excuse_requests', 'student_id'],
  ['friday_challenge_entries', 'student_id'], ['dhikr_challenge_counts', 'student_id'],
];

const PEOPLE = [
  { phone: '201141649134', name: 'ام وائل', gender: 'female' },
  { phone: '201091430351', name: 'أم عمار', gender: 'female' },
  { phone: '966500570262', name: 'امجاد الحربي', gender: 'female' },
];

const norm = s => (s || '').trim().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
const last9 = p => (p || '').replace(/\D/g, '').slice(-9);

async function refCounts(id) {
  const out = {};
  for (const [table, col] of REFS) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
    if (error) throw error;
    if (count) out[`${table}.${col}`] = count;
  }
  return out;
}
const total = c => Object.values(c).reduce((a, b) => a + b, 0);

for (const p of PEOPLE) {
  const { data, error } = await db.from('students')
    .select('id, name, phone, gender_category, teacher_id, created_at')
    .eq('academy_id', SOHBAH).is('teacher_id', null);
  if (error) throw error;
  const rows = data.filter(s => last9(s.phone) === last9(p.phone) && norm(s.name) === norm(p.name));
  if (rows.length < 2) { console.log(`skip ${p.name}: ${rows.length} row(s), nothing to merge`); continue; }

  for (const r of rows) r.refs = await refCounts(r.id);
  rows.sort((a, b) =>
    (b.gender_category === p.gender) - (a.gender_category === p.gender) ||
    total(b.refs) - total(a.refs) ||
    a.created_at.localeCompare(b.created_at));
  const [keep, ...drops] = rows;

  console.log(`\n${p.name}: keep ${keep.id} (${keep.gender_category}, ${keep.created_at.slice(0, 10)}, refs ${JSON.stringify(keep.refs)})`);
  for (const d of drops) {
    console.log(`  drop ${d.id} (${d.gender_category}, ${d.created_at.slice(0, 10)}, refs ${JSON.stringify(d.refs)})`);
  }
  if (!APPLY) continue;

  for (const d of drops) {
    for (const [table, col] of REFS) {
      if (!d.refs[`${table}.${col}`]) continue;
      const { error: m } = await db.from(table).update({ [col]: keep.id }).eq(col, d.id);
      if (m) { console.log(`STOP ${p.name}: could not move ${table}.${col} from ${d.id}: ${m.message}`); process.exit(1); }
    }
    const left = await refCounts(d.id);
    if (total(left)) { console.log(`STOP ${p.name}: ${d.id} is still used (${JSON.stringify(left)})`); process.exit(1); }
    const { error: del } = await db.from('students').delete().eq('id', d.id).eq('academy_id', SOHBAH);
    if (del) throw del;
  }
  const { error: u } = await db.from('students')
    .update({ gender_category: p.gender }).eq('id', keep.id).eq('academy_id', SOHBAH);
  if (u) throw u;
  console.log(`  merged`);
}
console.log(APPLY ? '\napplied' : '\ndry run — pass --apply to write');
