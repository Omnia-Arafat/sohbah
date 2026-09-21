import { createClient } from "@/lib/supabase/server";
import { isMissingSchema } from "@/lib/tracks-dal";

/**
 * One track: its definition, its forty weeks, and the cohorts running it.
 *
 * Same `null` convention as the other two track readers — see the note at the
 * top of src/lib/tracks-dal.ts.
 */

export type TrackWeek = {
  id: string;
  weekNumber: number;
  title: string | null;
  isPublished: boolean;
  /** Day rows that actually carry a memorisation range. */
  filledDays: number;
  totalDays: number;
};

export type TrackCohortDetail = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  maxStudents: number | null;
  teacherName: string | null;
  activeCount: number;
  pendingCount: number;
  /** Computed in the database from start_date; null before it is running. */
  currentWeek: number | null;
};

export type TrackDetail = {
  id: string;
  name: string;
  scope: string | null;
  durationWeeks: number;
  dailyLoad: string | null;
  defaultCapacity: number;
  isActive: boolean;
  weeks: TrackWeek[];
  cohorts: TrackCohortDetail[];
};

type RawWeek = {
  id: string;
  week_number: number;
  title_ar: string | null;
  is_published: boolean;
  cohort_id: string | null;
  track_week_days: { new_from_surah: number | null; review_text_ar: string | null }[] | null;
};

type RawCohort = {
  id: string;
  name_ar: string;
  status: string;
  start_date: string;
  max_students: number | null;
  teachers: { name: string } | null;
  track_enrollments: { status: string }[] | null;
};

type RawTrack = {
  id: string;
  name_ar: string;
  scope_ar: string | null;
  duration_weeks: number;
  daily_load_ar: string | null;
  default_cohort_capacity: number | null;
  is_active: boolean;
  track_weeks: RawWeek[] | null;
  track_cohorts: RawCohort[] | null;
};

export async function getTrackDetail(
  academyId: string,
  trackId: string,
): Promise<TrackDetail | null | "missing-schema"> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tracks" as never)
    .select(
      "id, name_ar, scope_ar, duration_weeks, daily_load_ar, " +
        "default_cohort_capacity, is_active, " +
        "track_weeks(id, week_number, title_ar, is_published, cohort_id, " +
        "track_week_days(new_from_surah, review_text_ar)), " +
        "track_cohorts(id, name_ar, status, start_date, max_students, " +
        "teachers(name), track_enrollments(status))",
    )
    .eq("academy_id" as never, academyId as never)
    .eq("id" as never, trackId as never)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.code)) return "missing-schema";
    console.error("getTrackDetail failed", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as RawTrack;

  // Only the track's own shared schedule; a cohort override is a variant of a
  // week, not an extra week, so it never lengthens this list.
  const weeks: TrackWeek[] = (row.track_weeks ?? [])
    .filter((w) => w.cohort_id === null)
    .sort((a, b) => a.week_number - b.week_number)
    .map((w) => {
      const days = w.track_week_days ?? [];
      return {
        id: w.id,
        weekNumber: w.week_number,
        title: w.title_ar,
        isPublished: w.is_published,
        // A day counts as entered once it carries either a new range or a
        // revision line — the meeting day and Friday only ever have the latter.
        filledDays: days.filter(
          (d) => d.new_from_surah !== null || (d.review_text_ar ?? "").trim() !== "",
        ).length,
        totalDays: days.length,
      };
    });

  const cohorts: TrackCohortDetail[] = (row.track_cohorts ?? []).map((c) => {
    const enrolments = c.track_enrollments ?? [];
    return {
      id: c.id,
      name: c.name_ar,
      status: c.status,
      startDate: c.start_date,
      maxStudents: c.max_students,
      teacherName: c.teachers?.name ?? null,
      activeCount: enrolments.filter(
        (e) => e.status === "active" || e.status === "warned",
      ).length,
      pendingCount: enrolments.filter(
        (e) => e.status === "pending" || e.status === "waitlisted",
      ).length,
      currentWeek: weekFromStart(c.start_date, row.duration_weeks, c.status),
    };
  });

  return {
    id: row.id,
    name: row.name_ar,
    scope: row.scope_ar,
    durationWeeks: row.duration_weeks,
    dailyLoad: row.daily_load_ar,
    defaultCapacity: row.default_cohort_capacity ?? 8,
    isActive: row.is_active,
    weeks,
    cohorts,
  };
}

/**
 * The same arithmetic `track_current_week()` does in the database, repeated
 * here only to avoid a round trip per cohort on a page that already has the
 * start date. A cohort that has paused carries `week_override` and the
 * database's answer is the true one — this is a display estimate for a
 * cohort that is simply running.
 */
function weekFromStart(
  startDate: string,
  durationWeeks: number,
  status: string,
): number | null {
  if (status !== "running") return null;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const days = Math.floor((Date.now() - start) / 86_400_000);
  if (days < 0) return null;
  return Math.min(Math.floor(days / 7) + 1, durationWeeks);
}
