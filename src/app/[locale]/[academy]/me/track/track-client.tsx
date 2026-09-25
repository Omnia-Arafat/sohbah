"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";

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
  days: Day[];
};

/** The four answers, in the order the academy's card prints them. */
const ITEMS = [
  { key: "recited_new", core: true },
  { key: "recited_review", core: true },
  { key: "heard_recitation", core: false },
  { key: "prayed_with_memorised", core: false },
] as const;

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
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [week, setWeek] = useState<Week | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "saved" | "none" | "error">(
    "idle",
  );

  /*
    Loaded on the first render that has an identity, not in an effect: the
    identity arrives from the store, and a fetch chained off it in an effect
    would fire again on every unrelated re-render.
  */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (me && loadedFor !== me.studentId && state !== "loading") {
    setLoadedFor(me.studentId);
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
      const rows = (data ?? []) as unknown as (Day & Omit<Week, "days">)[];
      if (error) {
        setState("error");
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
        <Link href={`/${academySlug}/me`} className="font-semibold underline">
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

  if (state === "error" || !week || !picked) {
    return <p className="card text-sm text-absent">{t("failed")}</p>;
  }

  const day = week.days.find((d) => d.session_date === picked)!;
  const core = draft.recited_new && draft.recited_review;
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
  }

  async function save() {
    if (!me || !picked) return;
    setSaving(true);
    const { error } = await supabase.rpc("report_track_day" as never, {
      p_student_id: me.studentId,
      p_phone: me.phone,
      p_session_date: picked,
      p_recited_new: Boolean(draft.recited_new),
      p_recited_review: Boolean(draft.recited_review),
      p_heard: Boolean(draft.heard_recitation),
      p_prayed: Boolean(draft.prayed_with_memorised),
    } as never);
    setSaving(false);
    if (error) {
      setState("error");
      return;
    }
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
      <div>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { track: week.track_name, week: week.week_number })}
        </p>
      </div>

      {week.partner_name && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
          <Users
            className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">{t("partner")}</span>
          <span className="min-w-0 flex-grow truncate text-sm font-bold">
            {week.partner_name}
          </span>
        </div>
      )}

      {/*
        The week as a strip, starting at the لقاء — which is where the week
        starts in the data too. Every day in it is open until the next لقاء,
        so there is nothing here to explain: what can be tapped, can be tapped.
      */}
      <ul className="flex gap-1.5 rounded-2xl border border-border-subtle bg-surface p-2">
        {week.days.map((d) => {
          const done = d.recited_new && d.recited_review;
          const some =
            d.recited_new ||
            d.recited_review ||
            d.heard_recitation ||
            d.prayed_with_memorised;
          const isPicked = d.session_date === picked;
          return (
            <li key={d.session_date} className="flex-grow">
              <button
                type="button"
                onClick={() => pick(d)}
                aria-current={isPicked}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-xl border text-[10px] font-semibold transition-colors ${
                  isPicked
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-border-subtle bg-surface hover:border-brand-600"
                }`}
              >
                <span className="truncate px-0.5">
                  {d.is_meeting
                    ? t("meeting")
                    : dayNames.format(new Date(`${d.session_date}T00:00:00Z`))}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    done
                      ? isPicked
                        ? "bg-white"
                        : "bg-brand-600"
                      : some
                        ? "border-2 border-accent-500"
                        : isPicked
                          ? "bg-white/40"
                          : "bg-surface-muted"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        The four answers. Whole rows, because a thumb aims at a row and not at
        a small square beside it — and the two that are not required say so on
        themselves, before they are touched rather than after.
      */}
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
        <p
          role="status"
          className="rounded-2xl border border-present/40 bg-present/5 px-4 py-3 text-sm text-present"
        >
          {core ? t("savedCard") : t("savedPartial")}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary min-h-12 w-full disabled:opacity-60"
      >
        {saving ? t("saving") : core ? t("saveAndSend") : t("saveWhatIsDone")}
      </button>

      <Link
        href={`/${academySlug}/me`}
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
