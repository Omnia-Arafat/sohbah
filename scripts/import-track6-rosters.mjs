// Put the المسار السادس rosters (from the teachers' weekly WhatsApp reports,
// 2026-09-26) onto their cohorts, and set each cohort's معلمة.
//
// Existing students only: the academy asked that no student row be created
// here. Every name below is matched to a record that already exists; anyone
// who had no clear match was left out and reported instead.
//
//   node scripts/import-track6-rosters.mjs          # dry run
//   node scripts/import-track6-rosters.mjs --apply  # write
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

// Cohort name → teacher name (as stored in `teachers`) and the students'
// names exactly as stored in `students`. A bare id is used where two rows
// share one name.
const ROSTERS = {
  'الدفعة الأولى': {
    teacher: 'شيماء جودة',
    students: ['راندا عبد الحليم', 'إكرام مبارك عبدالغفار', 'زينب محمد', 'منى أحمد ابوالحاج', 'أم كريم', 'سلمى زكريا'],
  },
  'الدفعة الثانية': {
    teacher: 'سارة حسن أحمد',
    students: ['سلوى زين العابدين', 'فاطمه آمين', 'امجاد الحربي', 'منى محمد يسرى', 'هبة محمد عفيفي', 'Sara Hassan', 'غادة شوقى'],
  },
  'الدفعة الثالثة': {
    teacher: 'أسماء إبراهيم محمد',
    students: ['ام كمال خلف', 'حنان سعيد', 'هديل رمضان خلف', 'فاطمة طارق', 'مريم احمد فايز', 'نوران علي السعيد', 'ساره اشرف', 'Menna'],
  },
  'الدفعة الرابعة': {
    teacher: 'شيماء جودة',
    students: ['إنجي إبراهيم', 'زينب عادل عبد الفتاح', 'ايمان محمد', 'ايمان ياسر', 'زينب على أحمد'],
  },
  'الدفعة الخامسة': {
    teacher: 'سارة حسن أحمد',
    students: ['مشمشه حامد', 'أميرة إبراهيم محمد', 'اسماء خضر', 'سهام جلال ابو الفضل'],
  },
  'الدفعة السادسة': {
    teacher: 'ياسمين عزيز',
    students: ['ولاء على خليل', 'آيات على', 'ام عمار', 'سحر حسنى', 'إسراء سمير', 'الزهراء سيد محمد أحمد', 'منار عبدالحليم البدري'],
  },
  'الدفعة السابعة': {
    teacher: 'أسماء إبراهيم محمد',
    students: ['اسماء صلاح', 'امتثال صلاح', 'حبيبة صبحي', 'نورا صبحي', 'سمر فهمي', 'سلوي محمود محمد عمر'],
  },
  'الدفعة الثامنة': {
    teacher: 'ياسمين عزيز',
    students: ['شاهيناز لاشين', 'خلود أحمد راجح', 'وعد', 'نوره خلف', 'هيام', 'رحاب علي عبدالحفيظ', 'زينب أكرم'],
  },
  'الدفعة التاسعة': {
    teacher: 'ندي مجدي عفيفي السيد',
    students: ['جنى عصام', 'انتصار سالم مصطفي احمد', 'هاله محمد احمد مصطفي', 'شيماء محمد عبدالسلام', 'ولاء القذافي محمد'],
  },
  'الدفعة العاشرة': {
    teacher: 'حنان محمد عبدالغني خلف',
    students: ['داليا يونس', 'نورين يونس', 'ازهار ابراهيم محمد', 'الشيماء علي', 'اسلام علي ابراهيم عكر'],
  },
  'الدفعة الحادية عشرة': {
    teacher: 'Marwa Saeed',
    students: ['مروة محمد', 'دعاء سعيد محمد بدر', 'روان حسين عبدالقادر حسين', 'افكار محمد'],
  },
  'الدفعة الثانية عشرة': {
    teacher: 'ميمونة شباح',
    students: ['امل ماجد المسوري', 'آمنه عبدالله', 'سناء القذافي', 'إيمان طه'],
  },
};

const { data: academy } = await db.from('academies').select('id').eq('slug', 'sohbah').single();
const { data: track } = await db.from('tracks').select('id').eq('academy_id', academy.id).eq('name_ar', 'المسار السادس').single();
const { data: cohorts } = await db.from('track_cohorts').select('id, name_ar, teacher_id, max_students').eq('track_id', track.id);
const { data: teachers } = await db.from('teachers').select('id, name').eq('academy_id', academy.id);
const { data: students } = await db.from('students').select('id, name').eq('academy_id', academy.id);
const { data: open } = await db.from('track_enrollments')
  .select('student_id, cohort_id, track_cohorts!inner(academy_id)')
  .eq('track_cohorts.academy_id', academy.id).in('status', ['active', 'warned']);
const enrolled = new Map(open.map(e => [e.student_id, e.cohort_id]));

// Where one person has two rows, take the one that carries her attendance.
async function pick(name) {
  const rows = students.filter(s => s.name === name);
  if (rows.length <= 1) return rows[0];
  let best = rows[0], most = -1;
  for (const r of rows) {
    const { count } = await db.from('attendance_records').select('*', { count: 'exact', head: true }).eq('student_id', r.id);
    if (count > most) { best = r; most = count; }
  }
  return best;
}

const inserts = [], teacherUpdates = [], problems = [];
for (const [cohortName, { teacher, students: names }] of Object.entries(ROSTERS)) {
  const cohort = cohorts.find(c => c.name_ar === cohortName);
  if (!cohort) { problems.push(`no cohort ${cohortName}`); continue; }

  if (teacher) {
    const t = teachers.filter(x => x.name === teacher);
    if (t.length !== 1) problems.push(`teacher ${teacher}: ${t.length} matches`);
    else if (cohort.teacher_id !== t[0].id) teacherUpdates.push({ cohort, teacher: t[0] });
  }

  const planned = [];
  for (const name of names) {
    const s = await pick(name);
    if (!s) { problems.push(`${cohortName}: no student ${name}`); continue; }
    const current = enrolled.get(s.id);
    if (current === cohort.id) continue;
    if (current) { problems.push(`${cohortName}: ${name} already on another cohort`); continue; }
    planned.push(s);
  }
  const taken = [...enrolled.values()].filter(id => id === cohort.id).length;
  if (cohort.max_students !== null && taken + planned.length > cohort.max_students) {
    problems.push(`${cohortName}: ${taken + planned.length} > ${cohort.max_students} seats`);
    continue;
  }
  for (const s of planned) inserts.push({ cohort, student: s });
}

for (const u of teacherUpdates) console.log(`teacher  ${u.cohort.name_ar} → ${u.teacher.name}`);
for (const i of inserts) console.log(`enrol    ${i.cohort.name_ar} ← ${i.student.name}`);
console.log(`\n${teacherUpdates.length} teacher changes, ${inserts.length} enrolments`);
if (problems.length) { console.log('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
if (!APPLY) { console.log('\ndry run — pass --apply to write'); process.exit(0); }

for (const u of teacherUpdates) {
  const { error } = await db.from('track_cohorts').update({ teacher_id: u.teacher.id }).eq('id', u.cohort.id);
  if (error) throw error;
}
const now = new Date().toISOString();
const { error } = await db.from('track_enrollments').insert(inserts.map(i => ({
  cohort_id: i.cohort.id,
  student_id: i.student.id,
  status: 'active',
  joined_at: now,
  decided_at: now,
  decision_note: 'أُضيفت مباشرةً عند نقل الدفعة إلى النظام',
})));
if (error) throw error;
console.log('applied');
