"use client";

import { ChevronLeft, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { doneCount, todayOf } from "@/components/student-record";
import { SignIn } from "../me/me-client";
import { setMe } from "@/lib/me-store";
import { trackQuery, useMe, useMyRecord, type MyTrackDay } from "@/lib/use-my-record";

function useMyRecordWithKey(academySlug: string) {
  const { key } = useMe(academySlug);
  return { key, ...useMyRecord(academySlug) };
}

export function TracksClient({ academySlug }: { academySlug: string }) {
  const t = useTranslations("studentHome.tracksPage");
  const tTrack = useTranslations("studentHome.track");
  const tDay = useTranslations("trackDay");
  const { key, me, data } = useMyRecordWithKey(academySlug);

  // my_track_week returns one row per day; a track is its enrollment.
  const byEnrollment = new Map<string, MyTrackDay[]>();
  for (const day of data?.trackDays ?? []) {
    byEnrollment.set(day.enrollment_id, [...(byEnrollment.get(day.enrollment_id) ?? []), day]);
  }
  const tracks = [...byEnrollment.values()];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!me ? (
        <div className="card">
          <SignIn bare academySlug={academySlug} onFound={(found) => setMe(key, found)} />
        </div>
      ) : !data ? (
        <p className="card text-sm text-muted-foreground">{tDay("loading")}</p>
      ) : tracks.length === 0 ? (
        <div className="card">
          <p className="font-bold">{tDay("noTrack")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tDay("noTrackNote")}</p>
        </div>
      ) : (
        tracks.map((days) => {
          const first = days[0];
          const today = todayOf(days);
          const finished = Boolean(today?.recited_new && today?.recited_review);
          return (
            <Link
              key={first.enrollment_id}
              href={`/${academySlug}/me/track${finished ? "/card" : ""}${trackQuery(first.enrollment_id, tracks.length)}`}
              prefetch={false}
              className="card flex flex-col gap-3 transition-colors hover:border-brand-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-display text-xl font-bold">{first.track_name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[first.cohort_name, first.teacher_name, first.partner_name && `${tDay("partner")}: ${first.partner_name}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                  {first.duration_weeks
                    ? tTrack("weekOf", { week: first.week_number, total: first.duration_weeks })
                    : tTrack("week", { week: first.week_number })}
                </span>
              </div>
              <div
                className={`flex items-center justify-between gap-3 rounded-xl p-3 ${
                  finished ? "bg-brand-50 dark:bg-brand-950/50" : "bg-surface-muted"
                }`}
              >
                <span className="text-sm font-semibold">
                  {finished ? tTrack("todayDone") : tTrack("today", { done: doneCount(today) })}
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold text-brand-700 dark:text-brand-300">
                  {finished ? tTrack("card") : tTrack("continue")}
                  <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
                </span>
              </div>
            </Link>
          );
        })
      )}

      {tracks.length > 0 && (
        <p className="flex gap-2.5 rounded-xl border border-dashed border-brand-200 p-3.5 text-sm leading-relaxed text-muted-foreground dark:border-brand-800">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          {t("note")}
        </p>
      )}
    </div>
  );
}
