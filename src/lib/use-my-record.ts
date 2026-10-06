"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { clearMe, getMe, meKey, subscribeMe, type Me } from "@/lib/me-store";
import { buildProgress } from "@/lib/quran/progress";
import { createClient } from "@/lib/supabase/client";
import type { MyCircle, MyRecitation } from "@/lib/database.types";

/** One day row of my_track_week, only the fields the app reads. */
export type MyTrackDay = {
  enrollment_id: string;
  cohort_name: string | null;
  track_name: string;
  week_number: number;
  partner_name: string | null;
  session_date: string;
  is_today: boolean;
  is_meeting: boolean;
  recited_new: boolean;
  recited_review: boolean;
  heard_recitation: boolean;
  prayed_with_memorised: boolean;
  // The three below are absent until RUN_STEPS_TRACK_DAY_REPORTED_AT.sql has run.
  reported_at?: string | null;
  teacher_name?: string | null;
  duration_weeks?: number | null;
};

export type MyRecordData = {
  entries: MyRecitation[];
  circles: MyCircle[];
  trackDays: MyTrackDay[];
};

/**
 * A signed-in student's own record — her recitations, her circles and her
 * track week — read once per page load and shared by everything that shows a
 * piece of it.
 *
 * The home screen, the bottom bar and صفحة الحفظ each need part of it; three
 * components fetching separately would be nine calls for one screen. So the
 * request is kept per student, and a client navigation between those screens
 * reuses it rather than asking again.
 *
 * It is read on the client for the reason صفحتي always was: who she is lives
 * in her browser (me-store), and her phone is the credential every one of
 * these RPCs checks.
 */
const inflight = new Map<string, Promise<MyRecordData | "stale">>();

/*
  The shared copy is never kept forever. On a phone the app stays open for
  days; a student added to a second مسار kept seeing one, because nothing
  asked again until she happened to reload. Coming back to the app clears it.
*/
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") invalidateMyRecord();
  });
}

function load(me: Me): Promise<MyRecordData | "stale"> {
  const cacheKey = `${me.studentId}:${me.phone}`;
  const cached = inflight.get(cacheKey);
  if (cached) return cached;

  const supabase = createClient();
  const request = (async () => {
    const [recitations, myCircles, trackWeek] = await Promise.all([
      supabase.rpc("my_recitations", { p_student_id: me.studentId, p_phone: me.phone }),
      supabase.rpc("my_circles", { p_student_id: me.studentId, p_phone: me.phone }),
      // The مسارات RPCs are not in the generated types yet.
      supabase.rpc("my_track_week" as never, {
        p_student_id: me.studentId,
        p_phone: me.phone,
      } as never),
    ]);

    if (recitations.error) console.error("my_recitations failed", recitations.error);
    if (myCircles.error) console.error("my_circles failed", myCircles.error);
    if (trackWeek.error) console.error("my_track_week failed", trackWeek.error);

    /*
      A stored identity that no longer resolves is forgotten rather than shown
      an empty record: a مشرفة merged two duplicates or corrected a number, and
      this browser still holds the old id.
    */
    const stale = [recitations.error, myCircles.error].some(
      (failure) =>
        failure?.message === "student_not_found" || failure?.message === "phone_mismatch",
    );
    if (stale) return "stale" as const;

    return {
      entries: (recitations.data ?? []) as MyRecitation[],
      circles: (myCircles.data ?? []) as MyCircle[],
      trackDays: (trackWeek.data ?? []) as unknown as MyTrackDay[],
    };
  })();

  inflight.set(cacheKey, request);
  // A failed request must not be reused for the rest of the visit.
  request.catch(() => inflight.delete(cacheKey));
  return request;
}

/** Forget the shared copy, e.g. after she saves today's ورد. */
export function invalidateMyRecord() {
  inflight.clear();
  refreshListeners.forEach((listener) => listener());
}

/** Mounted readers, told to load again when the shared copy is dropped. */
const refreshListeners = new Set<() => void>();

export function useMe(academySlug: string) {
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );
  return { key, me };
}

export function useMyRecord(academySlug: string) {
  const { key, me } = useMe(academySlug);
  const [result, setResult] = useState<{ for: string; data: MyRecordData } | null>(null);
  const [generation, setGeneration] = useState(0);
  const forKey = me ? `${me.studentId}:${me.phone}` : null;

  useEffect(() => {
    const listener = () => setGeneration((n) => n + 1);
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    load(me).then(
      (data) => {
        if (cancelled) return;
        if (data === "stale") {
          clearMe(key);
          return;
        }
        setResult({ for: `${me.studentId}:${me.phone}`, data });
      },
      (error) => console.error("my record failed", error),
    );
    return () => {
      cancelled = true;
    };
  }, [me, key, generation]);

  const data = result && result.for === forKey ? result.data : null;
  const progress = useMemo(() => (data ? buildProgress(data.entries) : null), [data]);

  return { me, data, progress };
}

/**
 * my_track_week as one list of days per track, oldest enrollment first.
 *
 * A student may be on several مسارات; every row carries its enrollment.
 */
export function tracksOf(days: MyTrackDay[]): MyTrackDay[][] {
  const groups = new Map<string, MyTrackDay[]>();
  for (const day of days) {
    groups.set(day.enrollment_id, [...(groups.get(day.enrollment_id) ?? []), day]);
  }
  return [...groups.values()];
}

/**
 * The query string that names one track on the track pages: `?e=<enrollment>`.
 *
 * Only added when she is on more than one. With one track the pages need no
 * name for it — and the database functions only accept the argument once
 * RUN_STEPS_MULTIPLE_TRACKS.sql has run, so a single-track student never
 * sends it.
 */
export function trackQuery(enrollmentId: string, trackCount: number) {
  return trackCount > 1 ? `?e=${enrollmentId}` : "";
}
