import { createClient } from "@/lib/supabase/server";
import { isMissingSchema } from "@/lib/tracks-dal";

/**
 * The tracks index: the six programmes, how far their schedules are entered,
 * and what their running cohorts look like.
 *
 * Same tolerance rule as src/lib/tracks-dal.ts — `null` means the migration
 * has not been applied yet, so the screen can say so instead of throwing.
 */

export type TrackCohortRow = {
  id: string;
  name: string;
  status: string;
  maxStudents: number | null;
  /** Null until a معلمة is assigned. The list counts how many are still null. */
  teacherId: string | null;
  activeCount: number;
  pendingCount: number;
};

export type TrackRow = {
  id: string;
  name: string;
  scope: string | null;
  durationWeeks: number;
  isActive: boolean;
  displayOrder: number;
  publishedWeeks: number;
  cohorts: TrackCohortRow[];
};

type RawTrack = {
  id: string;
  name_ar: string;
  scope_ar: string | null;
  duration_weeks: number;
  is_active: boolean;
  display_order: number;
  track_weeks: { is_published: boolean; cohort_id: string | null }[] | null;
  track_cohorts:
    | {
        id: string;
        name_ar: string;
        status: string;
        max_students: number | null;
        teacher_id: string | null;
        track_enrollments: { status: string }[] | null;
      }[]
    | null;
};

export async function listTracks(academyId: string): Promise<TrackRow[] | null> {
  const supabase = await createClient();

  // One read, nested: a track's weeks and its cohorts' enrolment statuses are
  // only ever wanted together here, and six tracks is not a page worth
  // splitting into three round trips.
  const { data, error } = await supabase
    .from("tracks" as never)
    .select(
      "id, name_ar, scope_ar, duration_weeks, is_active, display_order, " +
        "track_weeks(is_published, cohort_id), " +
        "track_cohorts(id, name_ar, status, max_students, teacher_id, track_enrollments(status))",
    )
    .eq("academy_id" as never, academyId as never)
    .order("display_order" as never, { ascending: true } as never);

  if (error) {
    if (isMissingSchema(error.code)) return null;
    console.error("listTracks failed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as RawTrack[];

  return rows.map((row) => {
    // Only the track's own shared schedule counts towards "entered": a
    // cohort override is an extra version of a week, not another week.
    const publishedWeeks = (row.track_weeks ?? []).filter(
      (w) => w.cohort_id === null && w.is_published,
    ).length;

    const cohorts: TrackCohortRow[] = (row.track_cohorts ?? [])
      .filter((c) => c.status !== "finished")
      .map((cohort) => {
        const enrolments = cohort.track_enrollments ?? [];
        return {
          id: cohort.id,
          name: cohort.name_ar,
          status: cohort.status,
          maxStudents: cohort.max_students,
          teacherId: cohort.teacher_id,
          activeCount: enrolments.filter(
            (e) => e.status === "active" || e.status === "warned",
          ).length,
          pendingCount: enrolments.filter(
            (e) => e.status === "pending" || e.status === "waitlisted",
          ).length,
        };
      });

    return {
      id: row.id,
      name: row.name_ar,
      scope: row.scope_ar,
      durationWeeks: row.duration_weeks,
      isActive: row.is_active,
      displayOrder: row.display_order,
      publishedWeeks,
      cohorts,
    };
  });
}
