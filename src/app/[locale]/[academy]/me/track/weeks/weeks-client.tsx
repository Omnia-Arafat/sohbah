"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";
import {
  DAY_LEAF,
  arNum,
  encodeSheet,
  hasRange,
  meetingLine,
  rangeText,
  surahName,
  weekHasContent,
  weekSurah,
  emptyDays,
  type ScheduleWeek,
} from "@/lib/schedule-format";
import { SignIn } from "../../me-client";

type Enrollment = {
  enrollment_id: string;
  track_id: string;
  cohort_id: string;
  track_name: string;
  cohort_name: string;
  current_week: number;
  duration_weeks: number;
  start_date: string;
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
  track_week_days:
    | {
        day_index: number;
        new_from_surah: number | null;
        new_from_ayah: number | null;
        new_to_surah: number | null;
        new_to_ayah: number | null;
        review_text_ar: string | null;
        notes_ar: string | null;
      }[]
    | null;
};

function toWeek(r: RawWeek): ScheduleWeek {
  const byIndex = new Map((r.track_week_days ?? []).map((d) => [d.day_index, d]));
  return {
    id: r.id,
    trackId: r.track_id,
    cohortId: r.cohort_id,
    weekNumber: r.week_number,
    title: r.title_ar ?? "",
    isPublished: r.is_published,
    meetingWeekday: r.meeting_weekday ?? null,
    meetingTime: r.meeting_time ?? "",
    days: emptyDays().map((e) => {
      const d = byIndex.get(e.dayIndex);
      return d
        ? {
            dayIndex: e.dayIndex,
            fromSurah: d.new_from_surah,
            fromAyah: d.new_from_ayah,
            toSurah: d.new_to_surah,
            toAyah: d.new_to_ayah,
            review: d.review_text_ar ?? "",
            notes: d.notes_ar ?? "",
          }
        : e;
    }),
  };
}

const DAYS = "track_week_days(day_index, new_from_surah, new_from_ayah, new_to_surah, new_to_ayah, review_text_ar, notes_ar)";
const COLS = "id, track_id, cohort_id, week_number, title_ar, is_published";

/**
 * Her weeks: the current one focused, the rest one tap away in a grid, and a
 * download of any of them. Published weeks only, and none past this week.
 */
export function WeeksClient({ academySlug }: { academySlug: string }) {
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);
  const me = useSyncExternalStore(subscribeMe, useCallback(() => getMe(key), [key]), () => null);
  const requested = useSearchParams().get("e");

  const [state, setState] = useState<"idle" | "loading" | "ready" | "none" | "error" | "signIn">("idle");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [weeks, setWeeks] = useState<Map<number, ScheduleWeek>>(new Map());
  const [focus, setFocus] = useState<number | null>(null);

  // Loaded on the first render that has an identity (the pattern of
  // track-client.tsx), not in an effect that would refire on every render.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadKey = me ? `${me.studentId}:${requested ?? ""}` : null;
  if (me && loadedFor !== loadKey && state !== "loading") {
    setLoadedFor(loadKey);
    setState("loading");
    void (async () => {
      const { data, error } = await supabase.rpc("my_track_schedules" as never, {
        p_student_id: me.studentId,
        p_phone: me.phone,
      } as never);
      if (error) {
        setState(error.message === "student_not_found" || error.message === "phone_mismatch" ? "signIn" : "error");
        return;
      }
      const all = (data ?? []) as unknown as Enrollment[];
      const mine = all.find((r) => r.enrollment_id === requested) ?? all[0];
      if (!mine) {
        setState("none");
        return;
      }

      const run = (cols: string) =>
        supabase
          .from("track_weeks" as never)
          .select(cols)
          .eq("track_id" as never, mine.track_id as never)
          .eq("is_published" as never, true as never)
          .lte("week_number" as never, mine.current_week as never)
          .or(`cohort_id.is.null,cohort_id.eq.${mine.cohort_id}`);
      let res = await run(`${COLS}, meeting_weekday, meeting_time, ${DAYS}`);
      if (res.error) res = await run(`${COLS}, ${DAYS}`);
      if (res.error) {
        setState("error");
        return;
      }

      // Her cohort's own copy of a week wins over the track's.
      const byWeek = new Map<number, ScheduleWeek>();
      for (const w of ((res.data ?? []) as unknown as RawWeek[]).map(toWeek)) {
        if (!weekHasContent(w.days)) continue;
        const had = byWeek.get(w.weekNumber);
        if (!had || (w.cohortId && !had.cohortId)) byWeek.set(w.weekNumber, w);
      }
      setEnrollment(mine);
      setWeeks(byWeek);
      setFocus(mine.current_week);
      setState("ready");
    })();
  }

  if (!me || state === "signIn") {
    return <SignIn academySlug={academySlug} onFound={() => setLoadedFor(null)} />;
  }
  if (state === "none") {
    return <div className="card font-semibold">مش مسجلة في مسار لسه.</div>;
  }
  if (state === "error") {
    return <div className="card font-semibold">ماقدرناش نجيب الجداول دلوقتي، جربي تاني بعد شوية.</div>;
  }
  if (state !== "ready" || !enrollment || focus === null) {
    return <div className="card animate-pulse font-semibold text-muted-foreground">بنجيب الجداول…</div>;
  }

  const current = enrollment.current_week;
  const week = weeks.get(focus) ?? null;
  const surah = week ? weekSurah(week.days) : null;
  const printHref = `/${academySlug}/print/schedule?s=${encodeSheet({ trackId: enrollment.track_id, cohort: enrollment.cohort_id, week: focus })}&back=${encodeURIComponent(`/${academySlug}/me/track/weeks`)}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <header className="flex flex-col">
        <span className="text-xs font-bold text-muted-foreground">
          {enrollment.track_name} · {enrollment.cohort_name}
        </span>
        <h1 className="text-xl font-black">جداول الأسابيع</h1>
      </header>

      <section aria-label="الأسبوع المختار" className="card flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="الأسبوع السابق" disabled={focus <= 1} onClick={() => setFocus(focus - 1)} className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-lime-200 text-brand-700 disabled:opacity-40">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <div className="flex flex-1 flex-col items-center">
            <span className="text-lg font-black">
              الأسبوع {arNum(focus)} <span className="text-xs font-bold text-muted-foreground">من {arNum(enrollment.duration_weeks)}</span>
            </span>
            <span className={`rounded-full px-2.5 text-xs font-extrabold ${focus === current ? "bg-maroon-100 text-maroon-600" : "bg-lime-100 text-brand-700"}`}>
              {focus === current ? "الأسبوع الحالي" : "أسبوع فات"}
            </span>
          </div>
          <button type="button" aria-label="الأسبوع التالي" disabled={focus >= current} onClick={() => setFocus(focus + 1)} className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-lime-200 text-brand-700 disabled:opacity-40">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        </div>

        {week ? (
          <>
            {surah !== null && <div className="text-center font-display text-2xl font-bold text-brand-600">سورة {surahName(surah)}</div>}
            <div className="flex justify-between gap-2 rounded-xl bg-maroon-600 px-3 py-2 text-sm font-bold text-white">
              <span>لقاء المعلمة</span>
              <span className="text-maroon-100">{meetingLine(week, enrollment.start_date)}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {week.days.slice(1, 6).map((d, i) => (
                <li key={d.dayIndex} className="flex items-center gap-2 border-b border-border-subtle pb-1 text-sm font-bold">
                  <span className="flex size-6 flex-none items-center justify-center rounded-[3px_50%_3px_50%] text-xs font-black" style={{ background: DAY_LEAF[i], color: i >= 3 ? "#fff" : "#1f2a1c" }}>
                    {arNum(i + 1)}
                  </span>
                  <span className="flex-1">{hasRange(d) ? `حفظ سورة ${surahName(d.fromSurah)}` : d.review || "—"}</span>
                  <span className="font-display text-base text-brand-700">{rangeText(d)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-sand-200 px-3 py-1.5 text-xs font-extrabold text-sand-700">
              الجمعة · {week.days[6].notes || "راحة واستدراك"}
            </div>
            <Link href={printHref} className="btn-primary min-h-13 text-base">
              <Download className="size-5" aria-hidden="true" />
              نزّلي جدول الأسبوع {arNum(focus)}
            </Link>
          </>
        ) : (
          <p className="rounded-xl border-2 border-dashed border-lime-200 px-4 py-6 text-center font-bold text-muted-foreground">
            جدول الأسبوع ده لسه ماتنشرش.
          </p>
        )}
      </section>

      <section aria-labelledby="all" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="all" className="font-black">كل الأسابيع</h2>
          {focus !== current && (
            <button type="button" onClick={() => setFocus(current)} className="min-h-9 rounded-full bg-lime-100 px-3 text-xs font-extrabold text-brand-700">
              رجوع للأسبوع الحالي
            </button>
          )}
        </div>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: enrollment.duration_weeks }, (_, i) => {
            const n = i + 1;
            const locked = n > current;
            const look = n === current
              ? "bg-maroon-600 text-white"
              : !locked && weeks.has(n)
                ? "bg-brand-500 text-white"
                : locked
                  ? "border border-dashed border-border-subtle text-muted-foreground"
                  : "bg-surface-muted text-muted-foreground";
            return (
              <button
                key={n}
                type="button"
                disabled={locked}
                aria-label={`الأسبوع ${arNum(n)}`}
                aria-current={n === focus}
                onClick={() => setFocus(n)}
                className={`h-9 rounded-lg text-xs font-extrabold ${look} ${n === focus ? "outline-2 outline-offset-1 outline-foreground" : ""}`}
              >
                {arNum(n)}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
