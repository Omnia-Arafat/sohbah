// حنان سيد had two student rows on 01019134177, merged on 2026-10-04 at the
// academy's request:
//   f4f10bfc  «حنان سيد حسين»  registered 2026-08-27 — 78 attendances, 2 quiz
//             attempts, أذكار counts, and a WITHDRAWN place on المسار الأول /
//             الدفعة الثانية (which is why she saw no track).
//   703a690d  «حنان سيد»       made 2026-10-04 when she was added from the
//             staff list — linked to her staff account, active on المسار الأول
//             / الدفعة الثانية and المسار السادس / الدفعة الخامسة, no history.
//
// The OLD row stays, with everything on it. Nothing of hers is deleted:
//   1. today's place on الأول/الثانية — which she has already used: a day
//      reported and a رفيقة chosen — moves to the old row, carrying the old
//      place's original join date;
//   2. the old withdrawn place on that same دفعة is removed — only after
//      checking that nothing at all points at it (a student holds one place
//      per دفعة, so the two cannot both stay);
//   3. today's place on السادس/الخامسة moves to the old row, and every other
//      row that names the new row (her day report) is moved to the old one;
//   4. أذكار: today's zero-count duplicate of a challenge the old row already
//      holds (200) is removed; the other moves;
//   5. the staff link moves to the old row, and the new row is deleted once
//      nothing points at it.
//
//   node scripts/merge-hanan-2026-10-04.mjs          # dry run
//   node scripts/merge-hanan-2026-10-04.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOHBAH = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10';
const APPLY = process.argv.includes('--apply');

const OLD = 'f4f10bfc-bdc0-4413-8841-d4cc760a3845';
const NEW = '703a690d-af43-433c-aae8-5fe03fd381d9';
const OLD_PLACE = '0016ab2d';      // الأول / الثانية, withdrawn, empty → removed
const DUP_PLACE = 'b88659eb';      // الأول / الثانية, today's, in use → kept, moved
const MOVE_PLACE = 'aa96b2c9';     // السادس / الخامسة → moves to OLD

const STUDENT_REFS = [
  ['attendance_records', 'student_id'], ['quiz_attempts', 'student_id'],
  ['student_unit_progress', 'student_id'], ['recitation_logs', 'student_id'],
  ['track_enrollments', 'student_id'], ['track_recitations', 'student_id'],
  ['track_recitations', 'listener_student_id'], ['track_alerts', 'student_id'],
  ['track_day_reports', 'student_id'], ['track_excuse_requests', 'student_id'],
  ['friday_challenge_entries', 'student_id'], ['dhikr_challenge_counts', 'student_id'],
];
const ENROLLMENT_REFS = [
  ['track_absences', 'enrollment_id'], ['track_alerts', 'enrollment_id'],
  ['track_day_reports', 'enrollment_id'], ['track_excuse_requests', 'enrollment_id'],
  ['track_meeting_scores', 'enrollment_id'], ['track_partners', 'enrollment_id'],
  ['track_partners', 'partner_enrollment_id'], ['track_recitations', 'enrollment_id'],
  ['track_warnings', 'enrollment_id'],
];

const stop = msg => { console.log(`STOP: ${msg}`); process.exit(1); };
async function count(table, col, id) {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
  if (error) stop(`${table}.${col}: ${error.message}`);
  return n ?? 0;
}
async function refs(list, id) {
  const out = {};
  for (const [t, c] of list) { const n = await count(t, c, id); if (n) out[`${t}.${c}`] = n; }
  return out;
}
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// --- read and check everything is as expected -------------------------------
const { data: students, error: sErr } = await db.from('students')
  .select('id, name, phone_key, teacher_id, academy_id').in('id', [OLD, NEW]);
if (sErr) stop(sErr.message);
const oldRow = students.find(s => s.id === OLD);
const newRow = students.find(s => s.id === NEW);
if (!oldRow || !newRow) stop('one of the two rows is gone — already merged?');
if (oldRow.academy_id !== SOHBAH || newRow.academy_id !== SOHBAH) stop('not in صحبة');
if (oldRow.phone_key.slice(-9) !== newRow.phone_key.slice(-9)) stop('phones differ');
if (oldRow.teacher_id) stop('old row is already linked to a staff account');
if (!newRow.teacher_id) stop('new row is not the staff-linked one');

const { data: places, error: pErr } = await db.from('track_enrollments')
  .select('id, student_id, status, cohort_id').in('student_id', [OLD, NEW]);
if (pErr) stop(pErr.message);
const byPrefix = p => places.find(e => e.id.startsWith(p));
const oldPlace = byPrefix(OLD_PLACE), dupPlace = byPrefix(DUP_PLACE), movePlace = byPrefix(MOVE_PLACE);
if (!oldPlace || oldPlace.student_id !== OLD) stop('old place not found on the old row');
if (!dupPlace || dupPlace.student_id !== NEW) stop("today's الأول place not found on the new row");
if (!movePlace || movePlace.student_id !== NEW) stop('السادس place not found on the new row');
if (oldPlace.cohort_id !== dupPlace.cohort_id) stop('the old and duplicate places are not the same دفعة');

const oldPlaceRefs = await refs(ENROLLMENT_REFS, oldPlace.id);
if (sum(oldPlaceRefs)) stop(`the old place has history, not removing it: ${JSON.stringify(oldPlaceRefs)}`);
const { data: oldPlaceFull } = await db.from('track_enrollments').select('joined_at, requested_at').eq('id', oldPlace.id).single();

const { data: dhikr, error: dErr } = await db.from('dhikr_challenge_counts')
  .select('id, student_id, challenge_id, period_key, total').in('student_id', [OLD, NEW]);
if (dErr) stop(dErr.message);
const oldKeys = new Set(dhikr.filter(r => r.student_id === OLD).map(r => `${r.challenge_id}|${r.period_key}`));
const newDhikr = dhikr.filter(r => r.student_id === NEW);
const dhikrDrop = newDhikr.filter(r => oldKeys.has(`${r.challenge_id}|${r.period_key}`));
const dhikrMove = newDhikr.filter(r => !oldKeys.has(`${r.challenge_id}|${r.period_key}`));
// A duplicate is the same device total saved under the second row, not new
// أذكار: the old row keeps the larger of the two, so nothing is lost or doubled.
const oldDhikr = dhikr.filter(r => r.student_id === OLD);
const twinOf = r => oldDhikr.find(o => o.challenge_id === r.challenge_id && o.period_key === r.period_key);

console.log('keep  ', OLD, oldRow.name, 'refs', JSON.stringify(await refs(STUDENT_REFS, OLD)));
console.log('drop  ', NEW, newRow.name, 'refs', JSON.stringify(await refs(STUDENT_REFS, NEW)));
console.log(`1. move place ${dupPlace.id.slice(0, 8)} (in use: ${JSON.stringify(await refs(ENROLLMENT_REFS, dupPlace.id))}) to the old row, joined ${oldPlaceFull.joined_at}`);
console.log(`2. remove old empty place ${oldPlace.id.slice(0, 8)} (${oldPlace.status}, no history)`);
console.log(`3. move place ${movePlace.id.slice(0, 8)} and every other row naming the new row to the old row`);
console.log(`4. أذكار: ${dhikrDrop.map(r => `keep max(${twinOf(r).total}, ${r.total})`).join(', ') || 'no duplicates'}; move ${dhikrMove.length} (${dhikrMove.map(r => r.total).join(', ')})`);
console.log(`5. move the staff link, delete ${NEW.slice(0, 8)}`);
if (!APPLY) { console.log('\ndry run — pass --apply to write'); process.exit(0); }

// --- write --------------------------------------------------------------------
const must = async (label, q) => { const { error } = await q; if (error) stop(`${label}: ${error.message}`); };

await must('remove old empty place', db.from('track_enrollments').delete().eq('id', oldPlace.id).eq('student_id', OLD).eq('status', 'withdrawn'));
await must('move الأول place', db.from('track_enrollments')
  .update({ student_id: OLD, joined_at: oldPlaceFull.joined_at ?? undefined, requested_at: oldPlaceFull.requested_at }).eq('id', dupPlace.id).eq('student_id', NEW));
await must('move السادس place', db.from('track_enrollments').update({ student_id: OLD }).eq('id', movePlace.id).eq('student_id', NEW));
for (const [t, c] of STUDENT_REFS) {
  if (t === 'dhikr_challenge_counts' || t === 'track_enrollments') continue;
  if (!(await count(t, c, NEW))) continue;
  await must(`move ${t}.${c}`, db.from(t).update({ [c]: OLD }).eq(c, NEW));
}
for (const r of dhikrDrop) {
  const twin = twinOf(r);
  if (r.total > twin.total) {
    await must('raise أذكار count to the larger', db.from('dhikr_challenge_counts').update({ total: r.total }).eq('id', twin.id));
  }
  await must('remove أذكار duplicate', db.from('dhikr_challenge_counts').delete().eq('id', r.id));
}
for (const r of dhikrMove) await must('move أذكار count', db.from('dhikr_challenge_counts').update({ student_id: OLD }).eq('id', r.id));

const teacherId = newRow.teacher_id;
await must('unlink new row', db.from('students').update({ teacher_id: null }).eq('id', NEW));
await must('link old row', db.from('students').update({ teacher_id: teacherId }).eq('id', OLD));

const left = await refs(STUDENT_REFS, NEW);
if (sum(left)) stop(`the new row is still used, not deleting it: ${JSON.stringify(left)}`);
await must('delete new row', db.from('students').delete().eq('id', NEW).eq('academy_id', SOHBAH));

console.log('\nmerged. old row now:', JSON.stringify(await refs(STUDENT_REFS, OLD)));
