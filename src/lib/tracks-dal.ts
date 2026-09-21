import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the مسارات section.
 *
 * WHY EVERYTHING HERE TOLERATES THE TABLES NOT EXISTING:
 *
 * The tracks migration (20260921140000) lands separately from this code, and
 * /admin is the academy's live control panel — a مشرفة opens it while circles
 * are running. Querying a table that is not there yet returns Postgres 42P01,
 * and an unhandled error in a Server Component takes the whole page down.
 *
 * So every read returns `null` for "not provisioned" and an empty array for
 * "provisioned but nothing in it". The dashboard tells those two apart and
 * shows either a short setup note or a real empty state — and either way the
 * circles half of the page keeps working.
 */

/*
  "This table is not there yet" arrives under FOUR different codes, and the
  two that actually fire are the PostgREST ones — which is why the first cut
  of this file silently showed an empty state instead of the setup note.

  PostgREST answers from its own schema cache before Postgres ever sees the
  query, so a table it has never heard of comes back as PGRST205, not 42P01.
  The Postgres codes are kept for the paths that do reach the server (an RPC
  inside a function body, a cache refreshed mid-deploy).
*/
/** PostgREST: table missing from the schema cache. */
const PGRST_UNDEFINED_TABLE = "PGRST205";
/** PostgREST: function missing from the schema cache. */
const PGRST_UNDEFINED_FUNCTION = "PGRST202";
/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = "42P01";
/** Postgres: function does not exist. */
const UNDEFINED_FUNCTION = "42883";

export function isMissingSchema(code: string | undefined) {
  return (
    code === PGRST_UNDEFINED_TABLE ||
    code === PGRST_UNDEFINED_FUNCTION ||
    code === UNDEFINED_TABLE ||
    code === UNDEFINED_FUNCTION
  );
}

export type CohortSummary = {
  id: string;
  name: string;
  trackName: string;
  durationWeeks: number;
  currentWeek: number | null;
  status: string;
  maxStudents: number | null;
  activeCount: number;
  pendingCount: number;
  registrationClosesAt: string | null;
};

export type TracksOverview = {
  trackCount: number;
  cohorts: CohortSummary[];
  /** Enrolled on a track right now, across every cohort. */
  enrolledCount: number;
  /** Applications and waitlisted names, across every cohort. */
  pendingCount: number;
  /** Open alerts — a student who has crossed a threshold and needs a decision. */
  openAlerts: TrackAlert[];
};

export type TrackAlert = {
  id: string;
  studentName: string;
  cohortName: string;
  title: string;
  detail: string | null;
  severity: "info" | "warn" | "critical";
  suggestedAction: string | null;
};

type CohortRow = {
  id: string;
  name_ar: string;
  status: string;
  max_students: number | null;
  registration_closes_at: string | null;
  tracks: { name_ar: string; duration_weeks: number } | null;
  track_enrollments: { status: string }[] | null;
};

type AlertRow = {
  id: string;
  title_ar: string;
  detail_ar: string | null;
  severity: "info" | "warn" | "critical";
  suggested_action: string | null;
  students: { name: string } | null;
  track_cohorts: { name_ar: string } | null;
};

/**
 * One round trip per concern, in parallel. `null` means the schema is not
 * there yet — see the note at the top of this file.
 */
export async function getTracksOverview(
  academyId: string,
): Promise<TracksOverview | null> {
  const supabase = await createClient();

  // `Database` was generated before these tables existed, so every table name
  // and column below is cast past it and narrowed back to a real row type
  // after the read. Regenerating the types once the migration is applied
  // removes the casts and nothing else.
  const [tracksResult, cohortsResult, alertsResult] = await Promise.all([
    supabase
      .from("tracks" as never)
      .select("id", { count: "exact", head: true })
      .eq("academy_id" as never, academyId as never)
      .eq("is_active" as never, true as never),
    supabase
      .from("track_cohorts" as never)
      .select(
        "id, name_ar, status, max_students, registration_closes_at, " +
          "tracks(name_ar, duration_weeks), track_enrollments(status)",
      )
      .eq("academy_id" as never, academyId as never)
      .in("status" as never, ["registering", "running"] as never),
    supabase
      .from("track_alerts" as never)
      .select(
        "id, title_ar, detail_ar, severity, suggested_action, " +
          "students(name), track_cohorts!inner(name_ar, academy_id)",
      )
      .eq("status" as never, "open" as never)
      .eq("track_cohorts.academy_id" as never, academyId as never)
      .order("raised_at" as never, { ascending: false } as never)
      .limit(6),
  ]);

  if (
    isMissingSchema(tracksResult.error?.code) ||
    isMissingSchema(cohortsResult.error?.code)
  ) {
    return null;
  }

  const cohortRows = (cohortsResult.data ?? []) as unknown as CohortRow[];
  // Alerts may fail on their own (the table is created in the same migration,
  // but a partially applied one is possible) — an empty list is honest here.
  const alertRows = alertsResult.error
    ? []
    : ((alertsResult.data ?? []) as unknown as AlertRow[]);

  let enrolledCount = 0;
  let pendingCount = 0;

  const cohorts: CohortSummary[] = cohortRows.map((row) => {
    const enrolments = row.track_enrollments ?? [];
    const active = enrolments.filter(
      (e) => e.status === "active" || e.status === "warned",
    ).length;
    const pending = enrolments.filter(
      (e) => e.status === "pending" || e.status === "waitlisted",
    ).length;

    enrolledCount += active;
    pendingCount += pending;

    return {
      id: row.id,
      name: row.name_ar,
      trackName: row.tracks?.name_ar ?? "",
      durationWeeks: row.tracks?.duration_weeks ?? 40,
      // Computed in the database by track_current_week(); read per cohort only
      // on the tracks pages, where it is worth the round trip.
      currentWeek: null,
      status: row.status,
      maxStudents: row.max_students,
      activeCount: active,
      pendingCount: pending,
      registrationClosesAt: row.registration_closes_at,
    };
  });

  return {
    trackCount: tracksResult.count ?? 0,
    cohorts,
    enrolledCount,
    pendingCount,
    openAlerts: alertRows.map((row) => ({
      id: row.id,
      studentName: row.students?.name ?? "",
      cohortName: row.track_cohorts?.name_ar ?? "",
      title: row.title_ar,
      detail: row.detail_ar,
      severity: row.severity,
      suggestedAction: row.suggested_action,
    })),
  };
}
