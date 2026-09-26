// Two students who each had two rows, confirmed as one person by the academy
// on 2026-09-26:
//   هاله محمد احمد  +  هاله محمد احمد مصطفي
//   شيماء محمد عزازى  +  شيماء محمد عزازى على
//
// The row that stays is the one carrying her history; it takes the fuller
// name and the E.164 phone. The other row goes. The script refuses to delete
// a row that anything still points at, so no attendance can be lost.
//
//   node scripts/merge-students-2026-09-26.mjs          # dry run
//   node scripts/merge-students-2026-09-26.mjs --apply  # write
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
  ['friday_challenge_entries', 'student_id'],
];

const MERGES = [
  { keep: 'de1c135a-b2dc-4991-8c97-0d8117aa91db', drop: 'e71f4afe-01cc-4e32-aaa7-9c26e0d09071',
    name: 'هاله محمد احمد مصطفي', phone: '+201020045103' },
  { keep: 'c119e05f-3395-4cec-8196-9697904522bd', drop: 'bd40364c-b808-4274-8169-707e04096cbe',
    name: 'شيماء محمد عزازى على', phone: '+201092022375' },
];

for (const m of MERGES) {
  const { data: rows } = await db.from('students').select('id, name, phone')
    .eq('academy_id', SOHBAH).in('id', [m.keep, m.drop]);
  if (rows.length !== 2) { console.log(`skip ${m.name}: already merged or missing`); continue; }

  const held = [];
  for (const [table, col] of REFS) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, m.drop);
    if (error) throw error;
    if (count) held.push(`${table}.${col}=${count}`);
  }
  if (held.length) { console.log(`STOP ${m.name}: the row to drop is still used (${held.join(', ')})`); process.exit(1); }

  console.log(`merge ${rows.map(r => r.name).join(' + ')} → ${m.name} ${m.phone}`);
  if (!APPLY) continue;

  // Drop first: phone_key is unique per academy, and both rows share it.
  const { error: d } = await db.from('students').delete().eq('id', m.drop).eq('academy_id', SOHBAH);
  if (d) throw d;
  const { error: u } = await db.from('students').update({ name: m.name, phone: m.phone }).eq('id', m.keep);
  if (u) throw u;
}
console.log(APPLY ? 'applied' : 'dry run — pass --apply to write');
