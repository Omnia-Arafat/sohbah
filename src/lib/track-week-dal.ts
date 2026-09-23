import { createClient } from "@/lib/supabase/server";
import { isMissingSchema } from "@/lib/tracks-dal";

/**
 * One week of a track's schedule, with its seven day rows.
 *
 * day_index, as the migration defines it:
 *   0 = لقاء المعلمة · 1..5 = اليوم الأول..الخامس · 6 = الجمعة
 *
 * The rows are seeded empty by the migration, so a week always has all seven
 * — this never has to create one, only fill it.
 */

export type DayRow = {
  dayIndex: number;
  newFromSurah: number | null;
  newFromAyah: number | null;
  newToSurah: number | null;
  newToAyah: number | null;
  reviewText: string;
  notes: string;
};

export type WeekDetail = {
  id: string;
  trackId: string;
  trackName: string;
  durationWeeks: number;
  weekNumber: number;
  title: string;
  isPublished: boolean;
  days: DayRow[];
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
  week_number: number;
  title_ar: string | null;
  is_published: boolean;
  track_week_days: RawDay[] | null;
  tracks: { name_ar: string; duration_weeks: number; academy_id: string } | null;
};

export async function getTrackWeek(
  academyId: string,
  trackId: string,
  weekNumber: number,
): Promise<WeekDetail | null | "missing-schema"> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("track_weeks" as never)
    .select(
      "id, track_id, week_number, title_ar, is_published, " +
        "track_week_days(day_index, new_from_surah, new_from_ayah, " +
        "new_to_surah, new_to_ayah, review_text_ar, notes_ar), " +
        "tracks!inner(name_ar, duration_weeks, academy_id)",
    )
    .eq("track_id" as never, trackId as never)
    .eq("week_number" as never, weekNumber as never)
    // The track's own shared week, never a cohort's override.
    .is("cohort_id" as never, null as never)
    .eq("tracks.academy_id" as never, academyId as never)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.code)) return "missing-schema";
    console.error("getTrackWeek failed", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as RawWeek;
  const byIndex = new Map((row.track_week_days ?? []).map((d) => [d.day_index, d]));

  const days: DayRow[] = Array.from({ length: 7 }, (_, i) => {
    const d = byIndex.get(i);
    return {
      dayIndex: i,
      newFromSurah: d?.new_from_surah ?? null,
      newFromAyah: d?.new_from_ayah ?? null,
      newToSurah: d?.new_to_surah ?? null,
      newToAyah: d?.new_to_ayah ?? null,
      reviewText: d?.review_text_ar ?? "",
      notes: d?.notes_ar ?? "",
    };
  });

  return {
    id: row.id,
    trackId: row.track_id,
    trackName: row.tracks?.name_ar ?? "",
    durationWeeks: row.tracks?.duration_weeks ?? 40,
    weekNumber: row.week_number,
    title: row.title_ar ?? "",
    isPublished: row.is_published,
    days,
  };
}

/**
 * The previous week's last memorisation day, so a new week can open where the
 * one before it stopped. Returns null when there is nothing to continue from.
 */
export async function getPreviousWeekEnd(
  trackId: string,
  weekNumber: number,
): Promise<{ surah: number; ayah: number } | null> {
  if (weekNumber <= 1) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("track_weeks" as never)
    .select("track_week_days(day_index, new_to_surah, new_to_ayah)")
    .eq("track_id" as never, trackId as never)
    .eq("week_number" as never, (weekNumber - 1) as never)
    .is("cohort_id" as never, null as never)
    .maybeSingle();

  if (error || !data) return null;

  const days = ((data as unknown as RawWeek).track_week_days ?? [])
    .filter((d) => d.day_index >= 1 && d.day_index <= 5 && d.new_to_surah !== null)
    .sort((a, b) => b.day_index - a.day_index);

  const last = days[0];
  if (!last || last.new_to_surah === null) return null;
  return { surah: last.new_to_surah, ayah: last.new_to_ayah ?? 1 };
}

/**
 * Which cohorts are sitting on a given week of a track right now.
 *
 * The schedule hangs off the TRACK, so "which cohorts does this week apply
 * to" is not a choice anyone makes — it is a fact of where each cohort has
 * reached, and it changes by itself every Saturday. Asking the reader to
 * pick an audience would let her pick a wrong one; showing her the audience
 * cannot.
 *
 * Same arithmetic as track-detail-dal's weekFromStart, deliberately: two
 * screens disagreeing about which week a cohort is on would be worse than
 * either being wrong.
 */
export async function cohortsOnWeek(
  trackId: string,
  weekNumber: number,
  durationWeeks: number,
): Promise<{ id: string; name: string; teacherName: string | null }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("track_cohorts" as never)
    .select("id, name_ar, start_date, status, teachers(name)")
    .eq("track_id" as never, trackId as never)
    .eq("status" as never, "running" as never);

  if (error) {
    console.error("cohortsOnWeek failed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    name_ar: string;
    start_date: string;
    teachers: { name: string } | null;
  }[];

  return rows
    .filter((c) => {
      const start = new Date(`${c.start_date}T00:00:00Z`).getTime();
      const days = Math.floor((Date.now() - start) / 86_400_000);
      if (days < 0) return false;
      return Math.min(Math.floor(days / 7) + 1, durationWeeks) === weekNumber;
    })
    .map((c) => ({
      id: c.id,
      name: c.name_ar,
      teacherName: c.teachers?.name ?? null,
    }));
}
