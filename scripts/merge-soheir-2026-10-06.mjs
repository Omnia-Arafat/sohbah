// سهير محروس had two student rows on the same number (last 9 digits), so she
// saw only one of her two مسارات — whichever row her phone was signed in as:
//   84061dd9  «سهير محروس»    registered 2026-08-26 — 13 attendances, a quiz,
//             أذكار counts, active on المسار الرابع / الدفعة الأولى.
//   8c760d89  «م سهير محروس»  made 2026-09-21 — no history, active on
//             المسار الخامس / الدفعة الأولى.
//
// The OLD row stays, with everything on it. The new row's one place moves to
// it (a different مسار, so the one-place-per-track rule allows it), and the
// new row is deleted once nothing points at it. Neither row is linked to a
// staff account, so there is no link to move.
//
//   node scripts/merge-soheir-2026-10-06.mjs          # dry run
//   node scripts/merge-soheir-2026-10-06.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOHBAH = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10';
const APPLY = process.argv.includes('--apply');

const OLD = '84061dd9-821a-4e2e-ba04-020b16f7bb7e';
const NEW = '8c760d89-f5ac-4dd7-a69d-71e9efba2e54';

const STUDENT_REFS = [
  ['attendance_records', 'student_id'], ['quiz_attempts', 'student_id'],
  ['student_unit_progress', 'student_id'], ['recitation_logs', 'student_id'],
  ['track_enrollments', 'student_id'], ['track_recitations', 'student_id'],
  ['track_recitations', 'listener_student_id'], ['track_alerts', 'student_id'],
  ['track_day_reports', 'student_id'], ['track_excuse_requests', 'student_id'],
  ['friday_challenge_entries', 'student_id'], ['dhikr_challenge_counts', 'student_id'],
];

const stop = msg => { console.log(`STOP: ${msg}`); process.exit(1); };
async function count(table, col, id) {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
  if (error) stop(`${table}.${col}: ${error.message}`);
  return n ?? 0;
}
async function refs(id) {
  const out = {};
  for (const [t, c] of STUDENT_REFS) { const n = await count(t, c, id); if (n) out[`${t}.${c}`] = n; }
  return out;
}

// --- read and check everything is as expected -------------------------------
const { data: students, error: sErr } = await db.from('students')
  .select('id, name, phone_key, teacher_id, academy_id').in('id', [OLD, NEW]);
if (sErr) stop(sErr.message);
const oldRow = students.find(s => s.id === OLD);
const newRow = students.find(s => s.id === NEW);
if (!oldRow || !newRow) stop('one of the two rows is gone — already merged?');
if (oldRow.academy_id !== SOHBAH || newRow.academy_id !== SOHBAH) stop('not in صحبة');
if (oldRow.phone_key.slice(-9) !== newRow.phone_key.slice(-9)) stop('phones differ');
if (oldRow.teacher_id || newRow.teacher_id) stop('a row is linked to a staff account — handle that link first');

const newRefs = await refs(NEW);
const unexpected = Object.keys(newRefs).filter(k => k !== 'track_enrollments.student_id');
if (unexpected.length) stop(`the new row has more than a place: ${JSON.stringify(newRefs)}`);

const { data: places, error: pErr } = await db.from('track_enrollments')
  .select('id, student_id, status, track_cohorts(track_id, name_ar, tracks(name_ar))').in('student_id', [OLD, NEW]);
if (pErr) stop(pErr.message);
const newPlaces = places.filter(p => p.student_id === NEW);
const oldTracks = new Set(places.filter(p => p.student_id === OLD).map(p => p.track_cohorts.track_id));
for (const p of newPlaces) {
  if (oldTracks.has(p.track_cohorts.track_id)) stop(`both rows hold a place on ${p.track_cohorts.tracks.name_ar}`);
}

console.log('keep  ', OLD, oldRow.name, 'refs', JSON.stringify(await refs(OLD)));
console.log('drop  ', NEW, newRow.name, 'refs', JSON.stringify(newRefs));
for (const p of newPlaces) {
  console.log(`move place ${p.id.slice(0, 8)} (${p.status}, ${p.track_cohorts.tracks.name_ar} / ${p.track_cohorts.name_ar}) to the old row`);
}
console.log(`delete ${NEW.slice(0, 8)}`);
if (!APPLY) { console.log('\ndry run — pass --apply to write'); process.exit(0); }

// --- write --------------------------------------------------------------------
const must = async (label, q) => { const { error } = await q; if (error) stop(`${label}: ${error.message}`); };

for (const p of newPlaces) {
  await must('move place', db.from('track_enrollments').update({ student_id: OLD }).eq('id', p.id).eq('student_id', NEW));
}

const left = await refs(NEW);
if (Object.keys(left).length) stop(`the new row is still used, not deleting it: ${JSON.stringify(left)}`);
await must('delete new row', db.from('students').delete().eq('id', NEW).eq('academy_id', SOHBAH));

console.log('\nmerged. old row now:', JSON.stringify(await refs(OLD)));
