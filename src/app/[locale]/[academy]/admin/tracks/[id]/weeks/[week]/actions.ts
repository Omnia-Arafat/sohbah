"use server";

import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";
import { surahByNumber } from "@/lib/quran/surahs";

export type SaveWeekState = { status: "idle" | "saved"; error: string | null };

type DayInput = {
  day_index: number;
  new_from_surah: number | null;
  new_from_ayah: number | null;
  new_to_surah: number | null;
  new_to_ayah: number | null;
  review_text_ar: string | null;
  notes_ar: string | null;
};

function num(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function text(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Save one week of a track's schedule.
 *
 * The seven rows already exist — the migration seeds every week with its days
 * — so this is an update per row, keyed by (week_id, day_index), which is the
 * table's own unique constraint.
 */
export async function saveWeek(
  _prev: SaveWeekState,
  formData: FormData,
): Promise<SaveWeekState> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const weekId = String(formData.get("weekId") ?? "");
  const weekNumber = Number(formData.get("weekNumber") ?? 0);
  const title = text(formData.get("title"));
  const publish = formData.get("isPublished") === "on";

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return { status: "idle", error: "notAuthorized" };
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "idle", error: "notFound" };

  const days: DayInput[] = [];
  for (let i = 0; i < 7; i++) {
    const fromSurah = num(formData.get(`d${i}_fromSurah`));
    const fromAyah = num(formData.get(`d${i}_fromAyah`));
    const toSurah = num(formData.get(`d${i}_toSurah`));
    const toAyah = num(formData.get(`d${i}_toAyah`));

    // A range is all four or none of them: a half-entered range would pass the
    // database's forward check and still mean nothing on a student's screen.
    const anySet = [fromSurah, fromAyah, toSurah, toAyah].some((v) => v !== null);
    const allSet = [fromSurah, fromAyah, toSurah, toAyah].every((v) => v !== null);
    if (anySet && !allSet) return { status: "idle", error: `incomplete:${i}` };

    if (allSet) {
      const from = surahByNumber(fromSurah!);
      const to = surahByNumber(toSurah!);
      if (!from || !to) return { status: "idle", error: `surah:${i}` };
      if (fromAyah! > from.ayahs || toAyah! > to.ayahs) {
        return { status: "idle", error: `ayah:${i}` };
      }
      // Same rule the table enforces, checked here so she gets a sentence.
      if (
        toSurah! < fromSurah! ||
        (toSurah === fromSurah && toAyah! < fromAyah!)
      ) {
        return { status: "idle", error: `backwards:${i}` };
      }
    }

    days.push({
      day_index: i,
      new_from_surah: allSet ? fromSurah : null,
      new_from_ayah: allSet ? fromAyah : null,
      new_to_surah: allSet ? toSurah : null,
      new_to_ayah: allSet ? toAyah : null,
      review_text_ar: text(formData.get(`d${i}_review`)),
      notes_ar: text(formData.get(`d${i}_notes`)),
    });
  }

  const supabase = await createClient();

  // `Database` predates these tables; see src/lib/tracks-dal.ts.
  const { error: weekError } = await supabase
    .from("track_weeks" as never)
    .update({ title_ar: title, is_published: publish } as never)
    .eq("id" as never, weekId as never);

  if (weekError) {
    console.error("saveWeek (week) failed", weekError);
    return { status: "idle", error: "saveFailed" };
  }

  for (const day of days) {
    const { error } = await supabase
      .from("track_week_days" as never)
      .update({
        new_from_surah: day.new_from_surah,
        new_from_ayah: day.new_from_ayah,
        new_to_surah: day.new_to_surah,
        new_to_ayah: day.new_to_ayah,
        review_text_ar: day.review_text_ar,
        notes_ar: day.notes_ar,
      } as never)
      .eq("week_id" as never, weekId as never)
      .eq("day_index" as never, day.day_index as never);

    if (error) {
      console.error("saveWeek (day) failed", error);
      return { status: "idle", error: "saveFailed" };
    }
  }

  revalidatePath(`/${academySlug}/admin/tracks/${trackId}/weeks/${weekNumber}`);
  revalidatePath(`/${academySlug}/admin/tracks/${trackId}`);
  revalidatePath(`/${academySlug}/admin/tracks`);
  revalidatePath(`/${academySlug}/admin`);

  return { status: "saved", error: null };
}
