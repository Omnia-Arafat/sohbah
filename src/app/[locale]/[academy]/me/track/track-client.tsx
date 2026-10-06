"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";
import { invalidateMyRecord, trackQuery } from "@/lib/use-my-record";
import { useSearchParams } from "next/navigation";

type Day = {
  session_date: string;
  is_today: boolean;
  is_meeting: boolean;
  recited_new: boolean;
  recited_review: boolean;
  heard_recitation: boolean;
  prayed_with_memorised: boolean;
};

type Week = {
  enrollment_id: string;
  cohort_name: string;
  track_name: string;
  week_number: number;
  partner_name: string | null;
  teacher_name?: string | null;
  duration_weeks?: number | null;
  days: Day[];
};

/** The four answers, in the order the academy's card prints them. */
const ITEMS = [
  { key: "recited_new", core: true },
  { key: "recited_review", core: true },
  { key: "heard_recitation", core: false },
  { key: "prayed_with_memorised", core: false },
] as const;

/** Her stored identity no longer opens her record; see use-my-record.ts. */
function isIdentityError(message: string | undefined) {
  return message === "student_not_found" || message === "phone_mismatch";
}

/**
 * ورد اليوم — the student's own four answers about one day.
 *
 * Reads and writes through the phone-credential RPCs, the same way the rest
 * of her page does: she has no account, so the database checks the number she
 * typed on every call.
 */
export function TrackClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("trackDay");
  const tTrack = useTranslations("studentHome.track");
  const tTracks = useTranslations("studentHome.tracksPage");
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [week, setWeek] = useState<Week | null>(null);
  const requested = useSearchParams().get("e");
  const [trackCount, setTrackCount] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<
    "idle" | "loading" | "saved" | "none" | "error" | "signIn"
  >("idle");
  /*
    A failed SAVE is said under the button, not in place of the page: it used
    to set `state` to "error", which threw away the week, the strip and her
    ticks and left one red line — she could not even see which day it was.
  */
  const [saveError, setSaveError] = useState<"dayClosed" | "signIn" | "failed" | null>(
    null,
  );

  /*
    Loaded on the first render that has an identity, not in an effect: the
    identity arrives from the store, and a fetch chained off it in an effect
    would fire again on every unrelated re-render.
  */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadKey = me ? `${me.studentId}:${requested ?? ""}` : null;
  if (me && loadedFor !== loadKey && state !== "loading") {
    setLoadedFor(loadKey);
    setState("loading");
    void (async () => {
      /*
        `as never`, like every other reader of the مسارات tables:
        database.types.ts is generated from the schema that is APPLIED, and
        this migration is not yet. The same escape the track pages already
        use, and it comes out when the types are regenerated.
      */
      const { data, error } = await supabase.rpc("my_track_week" as never, {
        p_student_id: me.studentId,
        p_phone: me.phone,
      } as never);
      const all = (data ?? []) as unknown as (Day & Omit<Week, "days">)[];
      // She may be on several tracks: this page is the one named by ?e=, or
      // her first when there is no name (one track, or an older link).
      const count = new Set(all.map((r) => r.enrollment_id)).size;
      const wanted = all.some((r) => r.enrollment_id === requested) ? requested : all[0]?.enrollment_id;
      const rows = all.filter((r) => r.enrollment_id === wanted);
      setTrackCount(count);
      if (error) {
        // A row merged away or a changed number: retrying cannot fix that,
        // signing in again can.
        setState(isIdentityError(error.message) ? "signIn" : "error");
        return;
      }
      if (rows.length === 0) {
        setState("none");
        return;
      }
      const head = rows[0];
      setWeek({
        enrollment_id: head.enrollment_id,
        cohort_name: head.cohort_name,
        track_name: head.track_name,
        week_number: head.week_number,
        partner_name: head.partner_name,
        teacher_name: head.teacher_name,
        duration_weeks: head.duration_weeks,
        days: rows.map((r) => ({
          session_date: r.session_date,
          is_today: r.is_today,
          is_meeting: r.is_meeting,
          recited_new: r.recited_new,
          recited_review: r.recited_review,
          heard_recitation: r.heard_recitation,
          prayed_with_memorised: r.prayed_with_memorised,
        })),
      });
      const today = rows.find((r) => r.is_today) ?? rows[0];
      setPicked(today.session_date);
      setDraft({
        recited_new: today.recited_new,
        recited_review: today.recited_review,
        heard_recitation: today.heard_recitation,
        prayed_with_memorised: today.prayed_with_memorised,
      });
      setState("idle");
    })();
  }

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        {t("signInFirst")}{" "}
        <Link href={`/${academySlug}`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  if (state === "loading") {
    return <p className="card text-sm text-muted-foreground">{t("loading")}</p>;
  }

  // Being on no track at all is ordinary here — most of the مقراة is not on
  // one — so it is a sentence, not an error.
  if (state === "none") {
    return (
      <section className="card">
        <p className="font-semibold">{t("noTrack")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("noTrackNote")}</p>
      </section>
    );
  }

  if (state === "signIn") {
    return (
      <p className="card text-sm text-absent">
        {t("signInAgain")}{" "}
        <Link href={`/${academySlug}`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  if (state === "error" || !week || !picked) {
    return <p className="card text-sm text-absent">{t("failed")}</p>;
  }

  const day = week.days.find((d) => d.session_date === picked)!;
  const query = trackQuery(week.enrollment_id, trackCount);
  const core = draft.recited_new && draft.recited_review;
  // The strip runs from the لقاء to the day before the next one, so it holds
  // days that have not come yet; the database refuses those (day_closed).
  const today = week.days.find((d) => d.is_today)?.session_date;
  const dayNames = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
  });

  function pick(d: Day) {
    setPicked(d.session_date);
    setDraft({
      recited_new: d.recited_new,
      recited_review: d.recited_review,
      heard_recitation: d.heard_recitation,
      prayed_with_memorised: d.prayed_with_memorised,
    });
    setState("idle");
    setSaveError(null);
  }

  async function save() {
    if (!me || !picked) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.rpc("report_track_day" as never, {
      p_student_id: me.studentId,
      p_phone: me.phone,
      p_session_date: picked,
      p_recited_new: Boolean(draft.recited_new),
      p_recited_review: Boolean(draft.recited_review),
      p_heard: Boolean(draft.heard_recitation),
      p_prayed: Boolean(draft.prayed_with_memorised),
      // Named only when she has more than one; see trackQuery.
      ...(trackCount > 1 && week ? { p_enrollment_id: week.enrollment_id } : {}),
    } as never);
    setSaving(false);
    if (error) {
      setSaveError(
        error.message === "day_closed"
          ? "dayClosed"
          : isIdentityError(error.message)
            ? "signIn"
            : "failed",
      );
      return;
    }
    // The home screen, the bar and the card read a shared copy of her record;
    // drop it so they show what she just saved.
    invalidateMyRecord();
    setWeek((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d) =>
              d.session_date === picked ? { ...d, ...draft } : d,
            ),
          }
        : prev,
    );
    setState("saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/${academySlug}/tracks`}
        prefetch={false}
        className="-mb-2 inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-brand-700 dark:text-brand-300"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
        {tTracks("title")}
      </Link>

      {/*
        The track, the week and the days in one block: which track this is,
        whose دفعة, and where in it she is, before the four answers.
      */}
      <section className="flex flex-col gap-3.5 rounded-2xl bg-brand-900 p-4 text-white">
        <div>
          <h1 className="font-display text-2xl font-bold">{week.track_name}</h1>
          <p className="mt-0.5 text-sm text-brand-100">
            {[week.cohort_name, week.teacher_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <p className="rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-bold">
          {week.duration_weeks
            ? tTrack("weekOf", { week: week.week_number, total: week.duration_weeks })
            : tTrack("week", { week: week.week_number })}
        </p>

        {/*
          The week as a strip, starting at the لقاء — which is where the week
          starts in the data too. Every day in it is open until the next لقاء,
          so there is nothing here to explain: what can be tapped, can be tapped.
        */}
        <ul className="flex gap-1.5">
          {week.days.map((d) => {
            const done = d.recited_new && d.recited_review;
            const some =
              d.recited_new ||
              d.recited_review ||
              d.heard_recitation ||
              d.prayed_with_memorised;
            const isPicked = d.session_date === picked;
            const notYet = today !== undefined && d.session_date > today;
            return (
              <li key={d.session_date} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => pick(d)}
                  disabled={notYet}
                  aria-current={isPicked}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-xl border text-[10px] font-semibold transition-colors ${
                    isPicked
                      ? "border-white bg-white text-brand-900"
                      : notYet
                        ? "border-white/10 bg-transparent text-brand-50/40"
                        : "border-white/20 bg-white/5 text-brand-50 hover:border-white/60"
                  }`}
                >
                  <span className="max-w-full truncate px-0.5">
                    {d.is_meeting
                      ? t("meeting")
                      : dayNames.format(new Date(`${d.session_date}T00:00:00Z`))}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${
                      done
                        ? isPicked
                          ? "bg-brand-600"
                          : "bg-brand-300"
                        : some
                          ? "border-2 border-accent-400"
                          : isPicked
                            ? "bg-brand-100"
                            : "bg-white/20"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/*
        Her رفيقة, and the way to set one. Without a name here the card goes
        out unsigned, so when there is none this is not a quiet grey line — it
        is the one gold thing on the screen, the same treatment a cohort with
        no معلمة gets on the admin side.
      */}
      <Link
        href={`/${academySlug}/me/track/partner${query}`}
        className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${
          week.partner_name
            ? "border-border-subtle bg-surface"
            : "border-accent-300 bg-accent-100 dark:border-accent-700 dark:bg-accent-700/20"
        }`}
      >
        <Users
          className={`h-4 w-4 shrink-0 ${
            week.partner_name
              ? "text-brand-600 dark:text-brand-300"
              : "text-accent-700 dark:text-accent-200"
          }`}
          aria-hidden="true"
        />
        {week.partner_name ? (
          <>
            <span className="text-xs text-muted-foreground">{t("partner")}</span>
            <span className="min-w-0 flex-grow truncate text-sm font-bold">
              {week.partner_name}
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand-700 dark:text-brand-300">
              {t("changePartner")}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-grow">
            <span className="block text-sm font-bold text-accent-700 dark:text-accent-200">
              {t("pickPartner")}
            </span>
            <span className="block text-[11px] text-accent-700/85 dark:text-accent-200/85">
              {t("pickPartnerNote")}
            </span>
          </span>
        )}
      </Link>

      {/*
        The four answers. Whole rows, because a thumb aims at a row and not at
        a small square beside it — and the two that are not required say so on
        themselves, before they are touched rather than after.
      */}
      <h2 className="-mb-1 font-display text-xl font-bold">
        {day.is_today ? t("title") : dayNames.format(new Date(`${day.session_date}T00:00:00Z`))}
      </h2>
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ key: k, core: isCore }) => {
          const on = Boolean(draft[k]);
          return (
            <li key={k}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setDraft((p) => ({ ...p, [k]: !p[k] }))}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 text-start transition-colors ${
                  on
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40"
                    : "border-border-subtle bg-surface"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border-subtle bg-surface text-transparent"
                  }`}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-grow">
                  <span className="block text-sm font-bold">{t(`items.${k}`)}</span>
                  {!isCore && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {t("optional")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {state === "saved" && (
        <div
          role="status"
          className="rounded-2xl border border-present/40 bg-present/5 px-4 py-3"
        >
          <p className="text-sm text-present">
            {core ? t("savedCard") : t("savedPartial")}
          </p>
          {/* The card is the reason she filled this in, so it is one tap from
              the confirmation rather than somewhere she has to go looking. */}
          {core && (
            <Link
              href={`/${academySlug}/me/track/card${query}`}
              className="mt-2 inline-block text-sm font-bold text-brand-700 underline dark:text-brand-300"
            >
              {t("openCard")}
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary min-h-12 w-full disabled:opacity-60"
      >
        {saving ? t("saving") : core ? t("saveAndSend") : t("saveWhatIsDone")}
      </button>

      {saveError && (
        <p role="alert" className="-mt-2 text-sm text-absent">
          {saveError === "signIn" ? (
            <>
              {t("signInAgain")}{" "}
              <Link href={`/${academySlug}`} className="font-semibold underline">
                {t("myPage")}
              </Link>
            </>
          ) : (
            t(saveError)
          )}
        </p>
      )}

      <Link
        href={`/${academySlug}/me/track/excuse${query}`}
        className="min-h-11 text-center text-sm font-semibold text-muted-foreground underline"
      >
        {t("excuse")}
      </Link>

      {/* The one explanation, at the bottom, in one sentence. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("windowNote")}
      </p>

      <p className="sr-only">{day.session_date}</p>
    </div>
  );
}
