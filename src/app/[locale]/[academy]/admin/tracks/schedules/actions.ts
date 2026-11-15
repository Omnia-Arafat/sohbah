"use server";

import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";
import { surahByNumber } from "@/lib/quran/surahs";
import { encodeSheet, type ScheduleDay } from "@/lib/schedule-format";

/**
 * Write one week's schedule to every place it was applied to: a track's own
 * week (every cohort gets it on reaching that week) and/or one cohort's own
 * copy of a week number (which wins for that cohort only).
 *
 * The track's own weeks are seeded by the tracks migration; a cohort's copy
 * is created here the first time. The seven day rows are upserted on their
 * unique (week_id, day_index).
 */

export type ApplyTarget = { trackId: string; cohort: string; week: number };

export type ApplyPayload = {
  academySlug: string;
  title: string;
  meetingWeekday: number | null;
  meetingTime: string;
  publish: boolean;
  days: ScheduleDay[];
  targets: ApplyTarget[];
};

export type ApplyResult =
  | { ok: true; sheets: string[]; saved: number }
  | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

function cleanDay(d: ScheduleDay, i: number): ScheduleDay | string {
  const nums = [d.fromSurah, d.fromAyah, d.toSurah, d.toAyah];
  const any = nums.some((v) => v !== null);
  const all = nums.every((v) => v !== null && Number.isInteger(v) && (v as number) > 0);
  if (any && !all) return `incomplete:${i}`;
  if (all) {
    const from = surahByNumber(d.fromSurah!);
    const to = surahByNumber(d.toSurah!);
    if (!from || !to) return `surah:${i}`;
    if (d.fromAyah! > from.ayahs || d.toAyah! > to.ayahs) return `ayah:${i}`;
    if (d.toSurah! < d.fromSurah! || (d.toSurah === d.fromSurah && d.toAyah! < d.fromAyah!)) {
      return `backwards:${i}`;
    }
  }
  return {
    dayIndex: i,
    fromSurah: all ? d.fromSurah : null,
    fromAyah: all ? d.fromAyah : null,
    toSurah: all ? d.toSurah : null,
    toAyah: all ? d.toAyah : null,
    review: (d.review ?? "").trim().slice(0, 300),
    notes: (d.notes ?? "").trim().slice(0, 300),
  };
}

export async function applySchedule(payload: ApplyPayload): Promise<ApplyResult> {
  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return { ok: false, error: "notAuthorized" };
  }
  const academy = await getAcademyBySlug(payload.academySlug);
  if (!academy) return { ok: false, error: "notFound" };

  if (!Array.isArray(payload.days) || payload.days.length !== 7) return { ok: false, error: "days" };
  const days: ScheduleDay[] = [];
  for (let i = 0; i < 7; i++) {
    const c = cleanDay(payload.days[i], i);
    if (typeof c === "string") return { ok: false, error: c };
    days.push(c);
  }

  const weekday =
    payload.meetingWeekday !== null && Number.isInteger(payload.meetingWeekday) &&
    payload.meetingWeekday >= 0 && payload.meetingWeekday <= 6
      ? payload.meetingWeekday
      : null;
  const meetingTime = (payload.meetingTime ?? "").trim().slice(0, 80);
  const title = (payload.title ?? "").trim().slice(0, 120) || null;

  // One write per distinct place, even if a row was added twice.
  const seen = new Set<string>();
  const targets = (payload.targets ?? []).filter((t) => {
    if (!UUID.test(t.trackId) || !(t.cohort === "base" || UUID.test(t.cohort))) return false;
    if (!Number.isInteger(t.week) || t.week < 1) return false;
    const key = `${t.trackId}.${t.cohort}.${t.week}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (targets.length === 0) return { ok: false, error: "noTargets" };

  const supabase = await createClient();

  // Every target must be a track (and cohort of that track) of this academy.
  const trackIds = [...new Set(targets.map((t) => t.trackId))];
  const { data: trackRows, error: trackErr } = await supabase
    .from("tracks" as never)
    .select("id, duration_weeks, track_cohorts(id)")
    .eq("academy_id" as never, academy.id as never)
    .in("id" as never, trackIds as never);
  if (trackErr) {
    console.error("applySchedule (tracks) failed", trackErr);
    return { ok: false, error: "saveFailed" };
  }
  const tracks = new Map(
    ((trackRows ?? []) as unknown as { id: string; duration_weeks: number; track_cohorts: { id: string }[] | null }[])
      .map((t) => [t.id, { duration: t.duration_weeks, cohorts: new Set((t.track_cohorts ?? []).map((c) => c.id)) }]),
  );
  for (const t of targets) {
    const track = tracks.get(t.trackId);
    if (!track) return { ok: false, error: "notFound" };
    if (t.week > track.duration) return { ok: false, error: "weekRange" };
    if (t.cohort !== "base" && !track.cohorts.has(t.cohort)) return { ok: false, error: "notFound" };
  }

  let meetingColumns = true;
  const weekFields = () => ({
    title_ar: title,
    is_published: payload.publish,
    ...(meetingColumns ? { meeting_weekday: weekday, meeting_time: meetingTime || null } : {}),
  });

  for (const t of targets) {
    const cohortId = t.cohort === "base" ? null : t.cohort;

    let find = supabase
      .from("track_weeks" as never)
      .select("id")
      .eq("track_id" as never, t.trackId as never)
      .eq("week_number" as never, t.week as never);
    find = cohortId ? find.eq("cohort_id" as never, cohortId as never) : find.is("cohort_id" as never, null as never);
    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) {
      console.error("applySchedule (find) failed", findErr);
      return { ok: false, error: "saveFailed" };
    }

    let weekId = (existing as { id: string } | null)?.id ?? null;

    const write = async () => {
      if (weekId) {
        return supabase.from("track_weeks" as never).update(weekFields() as never).eq("id" as never, weekId as never);
      }
      const res = await supabase
        .from("track_weeks" as never)
        .insert({ track_id: t.trackId, cohort_id: cohortId, week_number: t.week, ...weekFields() } as never)
        .select("id")
        .single();
      if (!res.error) weekId = (res.data as { id: string }).id;
      return res;
    };

    let res = await write();
    if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
      // The meeting columns have not been added yet (RUN_STEPS_TRACK_WEEK_SCHEDULES.sql).
      meetingColumns = false;
      res = await write();
    }
    if (res.error || !weekId) {
      console.error("applySchedule (week) failed", res.error);
      return { ok: false, error: "saveFailed" };
    }

    const { error: dayErr } = await supabase.from("track_week_days" as never).upsert(
      days.map((d) => ({
        week_id: weekId,
        day_index: d.dayIndex,
        new_from_surah: d.fromSurah,
        new_from_ayah: d.fromAyah,
        new_to_surah: d.toSurah,
        new_to_ayah: d.toAyah,
        review_text_ar: d.review || null,
        notes_ar: d.notes || null,
      })) as never,
      { onConflict: "week_id,day_index" },
    );
    if (dayErr) {
      console.error("applySchedule (days) failed", dayErr);
      return { ok: false, error: "saveFailed" };
    }
  }

  const slug = payload.academySlug;
  revalidatePath(`/${slug}/admin/tracks/schedules`);
  revalidatePath(`/${slug}/admin/tracks`);
  for (const id of trackIds) revalidatePath(`/${slug}/admin/tracks/${id}`);

  return {
    ok: true,
    saved: targets.length,
    sheets: targets.map((t) => encodeSheet({ trackId: t.trackId, cohort: t.cohort, week: t.week })),
  };
}
