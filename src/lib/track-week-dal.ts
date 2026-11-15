import { createClient } from "@/lib/supabase/server";

/**
 * One week of a track's schedule, with its seven day rows.
 *
 * day_index, as the migration defines it:
 *   0 = لقاء المعلمة · 1..5 = اليوم الأول..الخامس · 6 = الجمعة
 *
 * The rows are seeded empty by the migration, so a week always has all seven
 * — this never has to create one, only fill it.
 */

type RawWeek = {
  track_week_days: { day_index: number; new_to_surah: number | null; new_to_ayah: number | null }[] | null;
};

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
