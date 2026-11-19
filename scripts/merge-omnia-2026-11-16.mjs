// أمنية عرفات had two student rows, merged on 2026-11-16 at her request:
//   67c27c81  registered 2026-08-10 on 01144920632. Holds all her history:
//             attendance, a quiz attempt, Friday challenge entries and أذكار
//             counts. No track place.
//   2e75fa4d  made 2026-11-15 when she was added from the staff list, on her
//             staff number 01149389396. Linked to her staff account. Holds one
//             track place and nothing else.
//
// staff_existing_student() did not find the old row because the numbers
// differ, so it made a second one. That is the same split حنان سيد had
// (scripts/merge-hanan-2026-10-04.mjs).
//
// The OLD row stays, with everything on it:
//   1. every row that names the new row (its track place) moves to the old row.
//      Day reports, partners and the rest point at the place, so they move with it;
//   2. the staff link moves to the old row;
//   3. the new row is deleted, but only once nothing points at it.
//
//   node scripts/merge-omnia-2026-11-16.mjs          # dry run
//   node scripts/merge-omnia-2026-11-16.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOHBAH = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10';
const APPLY = process.argv.includes('--apply');

const OLD = '67c27c81-f43e-4336-a6b7-486ba99c953e';
const NEW = '2e75fa4d-a5ae-4094-a368-fe781d346de6';
const TEACHER = '46293ce3-e0a9-4976-bbe3-fbaea1d143f3';

const STUDENT_REFS = [
  ['attendance_records', 'student_id'], ['quiz_attempts', 'student_id'],
  ['student_unit_progress', 'student_id'], ['recitation_logs', 'student_id'],
  ['track_enrollments', 'student_id'], ['track_recitations', 'student_id'],
  ['track_recitations', 'listener_student_id'], ['track_alerts', 'student_id'],
  ['track_day_reports', 'student_id'], ['track_excuse_requests', 'student_id'],
  ['friday_challenge_entries', 'student_id'], ['dhikr_challenge_counts', 'student_id'],
  ['homework_submissions', 'student_id'], ['homework_progress', 'student_id'],
];

const stop = msg => { console.log(`STOP: ${msg}`); process.exit(1); };
const tableMissing = e => /does not exist|Could not find the table/i.test(e?.message ?? '');
async function count(table, col, id) {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
  if (error && tableMissing(error)) return 0;
  if (error) stop(`${table}.${col}: ${error.message}`);
  return n ?? 0;
}
async function refs(id) {
  const out = {};
  for (const [t, c] of STUDENT_REFS) { const n = await count(t, c, id); if (n) out[`${t}.${c}`] = n; }
  return out;
}
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
async function must(label, query) {
  const { error } = await query;
  if (error) stop(`${label}: ${error.message}`);
  console.log(`ok  ${label}`);
}

// --- check --------------------------------------------------------------------

const { data: rows, error: sErr } = await db.from('students')
  .select('id, name, phone, teacher_id, academy_id').in('id', [OLD, NEW]);
if (sErr) stop(sErr.message);
const oldRow = rows.find(r => r.id === OLD);
const newRow = rows.find(r => r.id === NEW);
if (!oldRow || !newRow) stop('one of the two rows is gone — already merged?');
if (oldRow.academy_id !== SOHBAH || newRow.academy_id !== SOHBAH) stop('not both in sohbah');
if (oldRow.teacher_id) stop('the old row is already linked to a staff account');
if (newRow.teacher_id !== TEACHER) stop('the new row is not linked to her staff account');

const oldRefs = await refs(OLD);
const newRefs = await refs(NEW);
const movable = Object.keys(newRefs);
if (movable.some(k => k !== 'track_enrollments.student_id')) {
  stop(`the new row holds more than a track place, review by hand: ${JSON.stringify(newRefs)}`);
}

const { data: places, error: pErr } = await db.from('track_enrollments')
  .select('id, student_id, cohort_id, status').in('student_id', [OLD, NEW]);
if (pErr) stop(pErr.message);
const oldCohorts = new Set(places.filter(p => p.student_id === OLD).map(p => p.cohort_id));
const newPlaces = places.filter(p => p.student_id === NEW);
if (newPlaces.some(p => oldCohorts.has(p.cohort_id))) {
  stop('the old row already holds a place in the same دفعة, review by hand');
}

console.log('keep  ', OLD, oldRow.name, oldRow.phone, 'refs', JSON.stringify(oldRefs));
console.log('drop  ', NEW, newRow.name, newRow.phone, 'refs', JSON.stringify(newRefs));
console.log(`1. move ${newPlaces.length} track place(s) to the old row`);
console.log('2. move the staff link to the old row');
console.log(`3. delete ${NEW.slice(0, 8)}`);
if (!APPLY) { console.log('\ndry run — pass --apply to write'); process.exit(0); }

// --- write --------------------------------------------------------------------

await must('move track places', db.from('track_enrollments').update({ student_id: OLD }).eq('student_id', NEW));
await must('unlink new row', db.from('students').update({ teacher_id: null }).eq('id', NEW));
await must('link old row', db.from('students').update({ teacher_id: TEACHER }).eq('id', OLD));

const left = await refs(NEW);
if (sum(left)) stop(`the new row is still used, not deleting it: ${JSON.stringify(left)}`);
await must('delete new row', db.from('students').delete().eq('id', NEW).eq('academy_id', SOHBAH));

console.log('\nmerged. old row now:', JSON.stringify(await refs(OLD)));
