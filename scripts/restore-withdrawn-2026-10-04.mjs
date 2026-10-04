// Every withdrawn place on a صحبة track put back, at the academy's request on
// 2026-10-04: the removals of 2026-09-27 and 2026-10-03 were not meant.
//
// A place is reactivated under its own id, so its join date and anything
// recorded against it come back with it. One is skipped — and named — when
// the student already holds an active place on the same track elsewhere,
// since a student holds one place per track.
//
//   node scripts/restore-withdrawn-2026-10-04.mjs          # dry run
//   node scripts/restore-withdrawn-2026-10-04.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOHBAH = '1bbbeae7-9479-48a0-a67f-6075ffb8ad10';
const APPLY = process.argv.includes('--apply');

const { data: places, error } = await db.from('track_enrollments')
  .select('id, student_id, status, left_at, students(name), track_cohorts!inner(academy_id, track_id, name_ar, tracks(name_ar))')
  .eq('track_cohorts.academy_id', SOHBAH)
  .in('status', ['active', 'warned', 'withdrawn']);
if (error) { console.log(error.message); process.exit(1); }

const holding = new Set(places.filter(p => p.status !== 'withdrawn')
  .map(p => `${p.student_id}|${p.track_cohorts.track_id}`));
const withdrawn = places.filter(p => p.status === 'withdrawn')
  .sort((a, b) => (a.left_at ?? '').localeCompare(b.left_at ?? ''));

let restored = 0, skipped = 0;
for (const p of withdrawn) {
  const label = `${p.students?.name} — ${p.track_cohorts.tracks?.name_ar} / ${p.track_cohorts.name_ar} (left ${p.left_at?.slice(0, 16)})`;
  const key = `${p.student_id}|${p.track_cohorts.track_id}`;
  if (holding.has(key)) { console.log(`skip    ${label}: already active on this track`); skipped++; continue; }
  console.log(`restore ${label}`);
  if (APPLY) {
    const { error: u } = await db.from('track_enrollments')
      .update({ status: 'active', left_at: null }).eq('id', p.id).eq('status', 'withdrawn');
    if (u) { console.log(`STOP at ${label}: ${u.message}`); process.exit(1); }
  }
  holding.add(key);
  restored++;
}
console.log(`\n${restored} to restore, ${skipped} skipped`);
console.log(APPLY ? 'applied' : 'dry run — pass --apply to write');
