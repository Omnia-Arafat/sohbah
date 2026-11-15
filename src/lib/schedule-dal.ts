import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isMissingSchema } from "@/lib/tracks-dal";
import {
  emptyDays,
  weekHasContent,
  type ScheduleDay,
  type ScheduleWeek,
  type SheetRef,
} from "@/lib/schedule-format";

/**
 * Reading weekly schedules for the redesigned screens: the list of all
 * schedules, the builder, the printed sheet and the quick downloads.
 *
 * A week belongs to a TRACK (cohort_id null, every cohort gets it on reaching
 * that week) or is one cohort's own copy of a week number (cohort_id set),
 * which wins for that cohort. That rule is the database's (my_track_week:
 * `cohort_id nulls last`); everything here follows it.
 *
 * `Database` predates these tables, hence the `as never` casts, as in
 * track-week-dal.ts.
 */

export type CatalogCohort = {
  id: string;
  name: string;
  startDate: string;
  status: string;
  teacherId: string | null;
};

export type CatalogTrack = {
  id: string;
  name: string;
  durationWeeks: number;
  cohorts: CatalogCohort[];
};

type RawDay = {
  day_index: number;
  new_from_surah: number | null;
  new_from_ayah: number | null;
  new_to_surah: number | null;
  new_to_ayah: number | null;
  review_text_ar: string | null;
  notes_ar: string | null;
};

type RawWeek = {
  id: string;
  track_id: string;
  cohort_id: string | null;
  week_number: number;
  title_ar: string | null;
  is_published: boolean;
  meeting_weekday?: number | null;
  meeting_time?: string | null;
  track_week_days: RawDay[] | null;
};

const DAY_COLS =
  "track_week_days(day_index, new_from_surah, new_from_ayah, new_to_surah, new_to_ayah, review_text_ar, notes_ar)";
const WEEK_COLS = "id, track_id, cohort_id, week_number, title_ar, is_published";
// Added by 20261115120000_track_week_schedules. Until that has been run the
// select falls back to the columns above and the meeting line is worked out
// from the cohort.
const MEETING_COLS = "meeting_weekday, meeting_time";

function isMissingColumn(code: string | undefined) {
  return code === "42703" || code === "PGRST204";
}

export function toWeek(row: RawWeek): ScheduleWeek {
  const byIndex = new Map((row.track_week_days ?? []).map((d) => [d.day_index, d]));
  const days: ScheduleDay[] = emptyDays().map((empty) => {
    const d = byIndex.get(empty.dayIndex);
    if (!d) return empty;
    return {
      dayIndex: empty.dayIndex,
      fromSurah: d.new_from_surah,
      fromAyah: d.new_from_ayah,
      toSurah: d.new_to_surah,
      toAyah: d.new_to_ayah,
      review: d.review_text_ar ?? "",
      notes: d.notes_ar ?? "",
    };
  });
  return {
    id: row.id,
    trackId: row.track_id,
    cohortId: row.cohort_id,
    weekNumber: row.week_number,
    title: row.title_ar ?? "",
    isPublished: row.is_published,
    meetingWeekday: row.meeting_weekday ?? null,
    meetingTime: row.meeting_time ?? "",
    days,
  };
}

/** Week rows of some tracks (or one track's week), with the meeting columns when they exist. */
async function selectWeeks(where: { trackIds: string[]; weekNumber?: number }): Promise<RawWeek[]> {
  const supabase = await createClient();
  const run = async (cols: string) => {
    let q = supabase
      .from("track_weeks" as never)
      .select(cols)
      .in("track_id" as never, where.trackIds as never);
    if (where.weekNumber !== undefined) {
      q = q.eq("week_number" as never, where.weekNumber as never);
    }
    return await q;
  };

  let res = await run(`${WEEK_COLS}, ${MEETING_COLS}, ${DAY_COLS}`);
  if (res.error && isMissingColumn(res.error.code)) {
    res = await run(`${WEEK_COLS}, ${DAY_COLS}`);
  }
  if (res.error) {
    if (!isMissingSchema(res.error.code)) console.error("selectWeeks failed", res.error);
    return [];
  }
  return (res.data ?? []) as unknown as RawWeek[];
}

/** Every active track of the academy with its cohorts, in display order. */
export async function getScheduleCatalog(academyId: string): Promise<CatalogTrack[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks" as never)
    .select(
      "id, name_ar, duration_weeks, display_order, " +
        "track_cohorts(id, name_ar, start_date, status, teacher_id)",
    )
    .eq("academy_id" as never, academyId as never)
    .eq("is_active" as never, true as never)
    .order("display_order" as never);

  if (error) {
    if (!isMissingSchema(error.code)) console.error("getScheduleCatalog failed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    name_ar: string;
    duration_weeks: number;
    track_cohorts:
      | { id: string; name_ar: string; start_date: string; status: string; teacher_id: string | null }[]
      | null;
  }[];

  return rows.map((t) => ({
    id: t.id,
    name: t.name_ar,
    durationWeeks: t.duration_weeks,
    cohorts: (t.track_cohorts ?? [])
      .filter((c) => c.status !== "finished")
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((c) => ({
        id: c.id,
        name: c.name_ar,
        startDate: c.start_date,
        status: c.status,
        teacherId: c.teacher_id,
      })),
  }));
}

export type WeekStatus = {
  trackId: string;
  cohortId: string | null;
  weekNumber: number;
  isPublished: boolean;
  hasContent: boolean;
};

/** Every week (track's own and cohorts' copies) of these tracks, in full. */
export async function getAllWeeks(trackIds: string[]): Promise<ScheduleWeek[]> {
  if (trackIds.length === 0) return [];
  return (await selectWeeks({ trackIds })).map(toWeek);
}

/** Which weeks exist and are filled, for the 40-week grids. */
export async function getWeekStatuses(trackIds: string[]): Promise<WeekStatus[]> {
  if (trackIds.length === 0) return [];
  const rows = await selectWeeks({ trackIds });
  return rows.map((r) => {
    const w = toWeek(r);
    return {
      trackId: w.trackId,
      cohortId: w.cohortId,
      weekNumber: w.weekNumber,
      isPublished: w.isPublished,
      hasContent: weekHasContent(w.days),
    };
  });
}

/**
 * The week a cohort actually sees (its own copy first, then the track's), or
 * the track's own week when `cohortId` is null. Null when neither exists.
 */
export async function getEffectiveWeek(
  trackId: string,
  cohortId: string | null,
  weekNumber: number,
): Promise<{ week: ScheduleWeek; own: boolean } | null> {
  const rows = await selectWeeks({ trackIds: [trackId], weekNumber });

  const own = cohortId ? rows.find((r) => r.cohort_id === cohortId) : undefined;
  if (own) return { week: toWeek(own), own: true };
  const shared = rows.find((r) => r.cohort_id === null);
  return shared ? { week: toWeek(shared), own: false } : null;
}

export type Sheet = {
  ref: SheetRef;
  trackName: string;
  cohortName: string | null;
  cohortStartDate: string | null;
  durationWeeks: number;
  week: ScheduleWeek | null;
};

/** Everything one printed sheet needs. Published weeks only, unless staff. */
export async function getSheet(ref: SheetRef): Promise<Sheet | null> {
  const supabase = await createClient();
  const { data: track } = await supabase
    .from("tracks" as never)
    .select("name_ar, duration_weeks")
    .eq("id" as never, ref.trackId as never)
    .maybeSingle();
  if (!track) return null;
  const t = track as unknown as { name_ar: string; duration_weeks: number };

  let cohortName: string | null = null;
  let cohortStartDate: string | null = null;
  const cohortId = ref.cohort === "base" ? null : ref.cohort;
  if (cohortId) {
    const { data: cohort } = await supabase
      .from("track_cohorts" as never)
      .select("name_ar, start_date, track_id")
      .eq("id" as never, cohortId as never)
      .maybeSingle();
    const c = cohort as unknown as { name_ar: string; start_date: string; track_id: string } | null;
    if (!c || c.track_id !== ref.trackId) return null;
    cohortName = c.name_ar;
    cohortStartDate = c.start_date;
  }

  const found = await getEffectiveWeek(ref.trackId, cohortId, ref.week);
  return {
    ref,
    trackName: t.name_ar,
    cohortName,
    cohortStartDate,
    durationWeeks: t.duration_weeks,
    week: found?.week ?? null,
  };
}
