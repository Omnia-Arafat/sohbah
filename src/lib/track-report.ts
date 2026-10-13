import type { createClient } from "@/lib/supabase/server";

/**
 * تقرير المسارات: how each student kept her ورد over a period.
 *
 * Absence is computed, never stored (PLAN_TRACKS §2.8): a required day with no
 * سرد is an absence. The required days are the five after the weekly لقاء —
 * offsets 1..5 from the cohort's start_date. The لقاء itself (offset 0) and
 * الجمعة (offset 6) are excluded, though students do send cards on them.
 *
 * A day stays open until the next لقاء («من يوم الحلقة لحد معاد الحلقة اللي
 * بعدها»), so a day in the running week with no card yet is not an absence —
 * it is only counted once its week has closed.
 *
 * The cards only went into use on `WARD_COUNTING_STARTS`; before that the
 * ورد was followed on paper, so no day before it is a required day. The weekly
 * لقاء is different: its attendance has been in the queue all along, so it
 * counts over the whole period, in the cohort's own circle.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ON_TRACK = ["active", "warned", "completed", "removed", "withdrawn"];
const REQUIRED_OFFSETS = new Set([1, 2, 3, 4, 5]);
const DAY_MS = 86_400_000;

/** The Saturday the students started sending بطاقة تتميم الورد. */
export const WARD_COUNTING_STARTS = "2026-10-03";

export type TrackReportCohort = {
  id: string;
  name: string;
  trackId: string;
  trackName: string;
  teacherName: string | null;
};

export type TrackReportRow = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  cohortId: string;
  status: string;
  /** Required days whose week has closed, or that already have a card. */
  due: number;
  /** Due days with سرد مقرر الحفظ or سرد مقرر المراجعة. */
  done: number;
  /** Due days with both — the full card. */
  full: number;
  /** Absences the academy accepted or wrote off (track_absences). */
  excused: number;
  /** Due, not done, not excused. */
  missed: number;
  /** Excuse requests nobody has decided yet. */
  pendingExcuses: number;
  /** Sessions she joined in her cohort's circle — the weekly لقاء. */
  meetings: number;
  /** Sessions that circle held while she was on the track; null when the cohort has no circle. */
  meetingsHeld: number | null;
  /** done / (due − excused), 0..100; null when nothing was due. */
  commitment: number | null;
  /** The weekly score: سرد days plus the لقاء's بنود, summed over the period. */
  points: number;
  maxPoints: number;
  weeks: TrackReportWeek[];
  /** The five required days of her latest week in the period, in order. */
  recentDays: DayStatus[];
};

export type DayStatus = "done" | "partial" | "missed" | "excused" | "open";

export type TrackReportWeek = {
  week: number;
  /** The week's لقاء day and the day before the next one. */
  from: string;
  to: string;
  /** Still running: its days can still be reported. */
  open: boolean;
  recitation: number;
  recitationMax: number;
  /** null when the معلمة has not marked this week's لقاء for the cohort. */
  meeting: number | null;
  meetingMax: number | null;
};

type ScoreRules = { perDay: number; components: { id: string; points: number }[] };

export type TrackReport = {
  cohorts: TrackReportCohort[];
  rows: TrackReportRow[];
  error: boolean;
};

type CohortRow = {
  id: string;
  name_ar: string;
  track_id: string;
  start_date: string;
  timezone: string;
  circle_id: string | null;
  tracks: { name_ar: string; duration_weeks: number } | null;
  teachers: { name: string } | null;
};

type EnrollmentRow = {
  id: string;
  cohort_id: string;
  student_id: string;
  status: string;
  joined_at: string | null;
  left_at: string | null;
  students: { name: string } | null;
};

function dayInTimezone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function toDays(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function fromDays(days: number): string {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** Every cohort the academy has run, for the filter — newest track first. */
export async function loadTrackReportCohorts(
  supabase: Supabase,
  academyId: string,
): Promise<{ cohorts: (TrackReportCohort & CohortRow)[]; error: boolean }> {
  const { data, error } = await supabase
    .from("track_cohorts" as never)
    .select(
      "id, name_ar, track_id, start_date, timezone, circle_id, " +
        "tracks(name_ar, duration_weeks), teachers!track_cohorts_teacher_id_fkey(name)",
    )
    .eq("academy_id" as never, academyId as never)
    .neq("status" as never, "draft" as never)
    .order("start_date" as never);

  if (error) console.error("track report: cohorts failed", error);

  const cohorts = ((data ?? []) as unknown as CohortRow[]).map((row) => ({
    ...row,
    name: row.name_ar,
    trackId: row.track_id,
    trackName: row.tracks?.name_ar ?? "",
    teacherName: row.teachers?.name ?? null,
  }));
  return { cohorts, error: Boolean(error) };
}

export async function loadTrackReport(
  supabase: Supabase,
  academyId: string,
  range: { from: string; to: string },
  filter: { trackId: string | null; cohortIds: string[] },
): Promise<TrackReport> {
  const loaded = await loadTrackReportCohorts(supabase, academyId);
  const cohorts = loaded.cohorts.filter(
    (c) =>
      (!filter.trackId || c.trackId === filter.trackId) &&
      (filter.cohortIds.length === 0 || filter.cohortIds.includes(c.id)) &&
      c.start_date <= range.to,
  );
  if (cohorts.length === 0) return { cohorts: [], rows: [], error: loaded.error };

  const { data: enrollData, error: enrollError } = await supabase
    .from("track_enrollments" as never)
    .select("id, cohort_id, student_id, status, joined_at, left_at, students(name)")
    .in("cohort_id" as never, cohorts.map((c) => c.id) as never)
    .in("status" as never, ON_TRACK as never);
  if (enrollError) console.error("track report: enrollments failed", enrollError);
  const enrollments = (enrollData ?? []) as unknown as EnrollmentRow[];
  if (enrollments.length === 0) {
    return { cohorts, rows: [], error: loaded.error || Boolean(enrollError) };
  }

  const enrollmentIds = enrollments.map((e) => e.id);
  const circleIds = [
    ...new Set(cohorts.map((c) => c.circle_id).filter((id): id is string => Boolean(id))),
  ];

  const [cards, absences, excuses, meetings, meetingScores, ruleSets] = await Promise.all([
    // Staff have no select on the cards or the excuse requests; these two
    // functions are the door (20261013100000_track_report_reads.sql).
    supabase.rpc("track_report_cards" as never, {
      p_enrollment_ids: enrollmentIds,
      p_from: range.from,
      p_to: range.to,
    } as never),
    supabase
      .from("track_absences" as never)
      .select("enrollment_id, absence_date")
      .in("enrollment_id" as never, enrollmentIds as never)
      .gte("absence_date" as never, range.from as never)
      .lte("absence_date" as never, range.to as never),
    supabase.rpc("track_report_pending_excuses" as never, {
      p_enrollment_ids: enrollmentIds,
      p_from: range.from,
      p_to: range.to,
    } as never),
    supabase
      .from("attendance_records")
      .select("student_id, circle_id, session_date")
      .in("circle_id", circleIds)
      .gte("session_date", range.from)
      .lte("session_date", range.to),
    supabase
      .from("track_meeting_scores" as never)
      .select("enrollment_id, week_number, component_id, points_awarded, excused")
      .in("enrollment_id" as never, enrollmentIds as never),
    supabase
      .from("track_rule_sets" as never)
      .select(
        "id, track_id, cohort_id, effective_from, " +
          "track_score_rules(points_per_recitation_day), " +
          "track_meeting_components(id, points, is_active)",
      )
      .in("track_id" as never, [...new Set(cohorts.map((c) => c.trackId))] as never),
  ]);

  const results = { cards, absences, excuses, meetings, meetingScores, ruleSets };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) console.error(`track report: ${name} failed`, result.error);
  }
  const error =
    loaded.error || Boolean(enrollError) || Object.values(results).some((r) => r.error);

  // The rule set in force today, the cohort's own before its track's.
  const ruleRows = (ruleSets.data ?? []) as unknown as {
    id: string;
    track_id: string;
    cohort_id: string | null;
    effective_from: string;
    track_score_rules: { points_per_recitation_day: number }[] | null;
    track_meeting_components: { id: string; points: number; is_active: boolean }[] | null;
  }[];
  const rulesFor = (cohortId: string, trackId: string, on: string): ScoreRules => {
    const pick = ruleRows
      .filter(
        (r) =>
          r.track_id === trackId &&
          (r.cohort_id === cohortId || r.cohort_id === null) &&
          r.effective_from <= on,
      )
      .sort(
        (a, b) =>
          Number(a.cohort_id === null) - Number(b.cohort_id === null) ||
          b.effective_from.localeCompare(a.effective_from),
      )[0];
    return {
      perDay: Number(pick?.track_score_rules?.[0]?.points_per_recitation_day ?? 5),
      components: (pick?.track_meeting_components ?? [])
        .filter((c) => c.is_active)
        .map((c) => ({ id: c.id, points: Number(c.points) })),
    };
  };

  // A week's لقاء counts once the معلمة has marked anyone in the cohort for it.
  const enrollmentCohort = new Map(enrollments.map((e) => [e.id, e.cohort_id]));
  const markedWeeks = new Set<string>();
  const scoresBy = new Map<string, { component_id: string; points_awarded: number; excused: boolean }[]>();
  for (const row of (meetingScores.data ?? []) as unknown as {
    enrollment_id: string;
    week_number: number;
    component_id: string;
    points_awarded: number;
    excused: boolean;
  }[]) {
    markedWeeks.add(`${enrollmentCohort.get(row.enrollment_id)}:${row.week_number}`);
    const key = `${row.enrollment_id}:${row.week_number}`;
    const list = scoresBy.get(key) ?? [];
    list.push(row);
    scoresBy.set(key, list);
  }

  const cardsBy = new Map<string, Map<string, { new: boolean; review: boolean }>>();
  for (const row of (cards.data ?? []) as unknown as {
    enrollment_id: string;
    session_date: string;
    recited_new: boolean;
    recited_review: boolean;
  }[]) {
    const days = cardsBy.get(row.enrollment_id) ?? new Map();
    days.set(row.session_date, { new: row.recited_new, review: row.recited_review });
    cardsBy.set(row.enrollment_id, days);
  }

  const excusedBy = new Map<string, Set<string>>();
  for (const row of (absences.data ?? []) as unknown as {
    enrollment_id: string;
    absence_date: string;
  }[]) {
    const days = excusedBy.get(row.enrollment_id) ?? new Set();
    days.add(row.absence_date);
    excusedBy.set(row.enrollment_id, days);
  }

  const pendingBy = new Map<string, number>();
  for (const row of (excuses.data ?? []) as unknown as { enrollment_id: string }[]) {
    pendingBy.set(row.enrollment_id, (pendingBy.get(row.enrollment_id) ?? 0) + 1);
  }

  // Per circle: the days it met, and the days each student was there.
  const heldBy = new Map<string, Set<string>>();
  const joinedBy = new Map<string, Set<string>>();
  for (const row of (meetings.data ?? []) as {
    student_id: string;
    circle_id: string;
    session_date: string;
  }[]) {
    const held = heldBy.get(row.circle_id) ?? new Set();
    held.add(row.session_date);
    heldBy.set(row.circle_id, held);
    const key = `${row.circle_id}:${row.student_id}`;
    const joined = joinedBy.get(key) ?? new Set();
    joined.add(row.session_date);
    joinedBy.set(key, joined);
  }

  const cohortById = new Map(cohorts.map((c) => [c.id, c]));
  const now = new Date();

  const rows: TrackReportRow[] = enrollments.map((e) => {
    const cohort = cohortById.get(e.cohort_id)!;
    const today = toDays(dayInTimezone(now, cohort.timezone));
    const start = toDays(cohort.start_date);
    const duration = cohort.tracks?.duration_weeks ?? 40;

    // The period, inside the cohort's forty weeks, until the day she left.
    const meetingFirst = Math.max(toDays(range.from), start);
    let last = Math.min(toDays(range.to), today, start + duration * 7 - 1);
    if (e.left_at) last = Math.min(last, toDays(dayInTimezone(new Date(e.left_at), cohort.timezone)));

    // The ورد counts from the day the cards started, or the day she joined
    // if that was later.
    let first = Math.max(meetingFirst, toDays(WARD_COUNTING_STARTS));
    if (e.joined_at) first = Math.max(first, toDays(dayInTimezone(new Date(e.joined_at), cohort.timezone)));

    const herCards = cardsBy.get(e.id);
    const herExcused = excusedBy.get(e.id);
    const rules = rulesFor(cohort.id, cohort.trackId, fromDays(today));
    const weekOf = (day: number) => Math.floor((day - start) / 7) + 1;
    const daysBy = new Map<number, DayStatus[]>();
    const weeks = new Map<number, TrackReportWeek>();
    const weekEntry = (week: number) => {
      let entry = weeks.get(week);
      if (!entry) {
        entry = {
          week,
          from: fromDays(start + (week - 1) * 7),
          to: fromDays(start + week * 7 - 1),
          open: start + week * 7 > today,
          recitation: 0,
          recitationMax: 0,
          meeting: null,
          meetingMax: null,
        };
        weeks.set(week, entry);
      }
      return entry;
    };
    let due = 0;
    let done = 0;
    let full = 0;
    let excused = 0;
    let missed = 0;

    for (let day = first; day <= last; day++) {
      const offset = (((day - start) % 7) + 7) % 7;
      if (!REQUIRED_OFFSETS.has(offset)) continue;
      const iso = fromDays(day);
      const card = herCards?.get(iso);
      const closesOn = day + (7 - offset);
      const dayList = daysBy.get(weekOf(day)) ?? [];
      daysBy.set(weekOf(day), dayList);
      if (!card && closesOn > today) {
        dayList.push("open");
        continue;
      }

      due++;
      const entry = weekEntry(weekOf(day));
      dayList.push(
        card && card.new && card.review
          ? "done"
          : card && (card.new || card.review)
            ? "partial"
            : herExcused?.has(iso)
              ? "excused"
              : "missed",
      );
      if (card && (card.new || card.review)) {
        done++;
        entry.recitationMax += rules.perDay;
        if (card.new && card.review) {
          full++;
          entry.recitation += rules.perDay;
        }
      } else if (herExcused?.has(iso)) {
        excused++;
      } else {
        missed++;
        entry.recitationMax += rules.perDay;
      }
    }

    for (let week = weekOf(meetingFirst); week <= weekOf(last); week++) {
      const meetingDay = start + (week - 1) * 7;
      if (meetingDay < meetingFirst || meetingDay > last) continue;
      if (!markedWeeks.has(`${cohort.id}:${week}`)) continue;
      const marks = scoresBy.get(`${e.id}:${week}`) ?? [];
      const excusedIds = new Set(marks.filter((m) => m.excused).map((m) => m.component_id));
      const entry = weekEntry(week);
      entry.meeting = marks.reduce((n, m) => n + Number(m.points_awarded), 0);
      entry.meetingMax = rules.components
        .filter((c) => !excusedIds.has(c.id))
        .reduce((n, c) => n + c.points, 0);
    }

    const weekList = [...weeks.values()].sort((a, b) => a.week - b.week);
    const latestDays = [...daysBy.keys()].sort((a, b) => b - a)[0];
    const points = weekList.reduce((n, w) => n + w.recitation + (w.meeting ?? 0), 0);
    const maxPoints = weekList.reduce((n, w) => n + w.recitationMax + (w.meetingMax ?? 0), 0);

    const counted = due - excused;
    const inWindow = (d: string) => {
      const day = toDays(d);
      return day >= meetingFirst && day <= last;
    };
    const circleId = cohort.circle_id;
    const held = circleId ? [...(heldBy.get(circleId) ?? [])].filter(inWindow).length : null;
    const sessions = circleId
      ? [...(joinedBy.get(`${circleId}:${e.student_id}`) ?? [])].filter(inWindow).length
      : 0;

    return {
      enrollmentId: e.id,
      studentId: e.student_id,
      studentName: e.students?.name ?? "",
      cohortId: e.cohort_id,
      status: e.status,
      due,
      done,
      full,
      excused,
      missed,
      pendingExcuses: pendingBy.get(e.id) ?? 0,
      meetings: sessions,
      meetingsHeld: held,
      commitment: counted > 0 ? Math.round((done / counted) * 100) : null,
      points,
      maxPoints,
      weeks: weekList,
      recentDays: latestDays === undefined ? [] : daysBy.get(latestDays)!,
    };
  });

  const ratio = (r: TrackReportRow) => (r.maxPoints > 0 ? r.points / r.maxPoints : -1);
  rows.sort(
    (a, b) =>
      ratio(b) - ratio(a) ||
      (b.commitment ?? -1) - (a.commitment ?? -1) ||
      b.done - a.done ||
      a.studentName.localeCompare(b.studentName, "ar"),
  );

  return { cohorts, rows, error };
}
