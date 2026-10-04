"use client";

import { ChevronLeft, CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CircleWhen } from "@/components/circle-when";
import { formatTime } from "@/lib/format-time";
import { formatRange } from "@/lib/quran/reference";
import type { Progress } from "@/lib/quran/progress";
import { trackQuery, tracksOf, useMyRecord, type MyTrackDay } from "@/lib/use-my-record";
import type { MyRecitation, RecitationRating } from "@/lib/database.types";

/**
 * A signed-in student's own record, as sections of the home screen.
 *
 * These used to be صفحتي, a second page she had to be sent to from a card on
 * the first one — while she was already signed in. Now the home screen is her
 * page: مساري, حفظك, حلقاتك and آخر تسميع sit on it directly, and the full جزء
 * map has a page of its own (/hifz) behind the حفظك card.
 *
 * Each section renders nothing until her record has loaded, except حفظك, which
 * holds its height so the page does not jump when it arrives.
 */

const TRACK_ITEMS = [
  "recited_new",
  "recited_review",
  "heard_recitation",
  "prayed_with_memorised",
] as const;

export function todayOf(days: MyTrackDay[]) {
  return days.find((day) => day.is_today) ?? null;
}

export function doneCount(day: MyTrackDay | null) {
  return day ? TRACK_ITEMS.filter((item) => day[item]).length : 0;
}

// =============================================================================
// مساري
// =============================================================================

export function MyTrackCard({ academySlug }: { academySlug: string }) {
  const t = useTranslations("studentHome.track");
  const tTracks = useTranslations("studentHome.tracksPage");
  const { data } = useMyRecord(academySlug);
  const tracks = tracksOf(data?.trackDays ?? []);
  if (tracks.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">
          {tracks.length > 1 ? tTracks("title") : t("title")}
        </h2>
        <Link
          href={`/${academySlug}/tracks`}
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-0.5 text-sm font-bold text-brand-700 dark:text-brand-300"
        >
          {t("all")}
          <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
        </Link>
      </div>
      {tracks.map((days) => {
        const first = days[0];
        const today = todayOf(days);
        const finished = Boolean(today?.recited_new && today?.recited_review);
        return (
          <Link
            key={first.enrollment_id}
            href={`/${academySlug}/me/track${trackQuery(first.enrollment_id, tracks.length)}`}
            prefetch={false}
            className="card flex flex-col gap-3 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-bold">{first.track_name}</span>
                {first.cohort_name && (
                  <span className="truncate text-xs text-muted-foreground">{first.cohort_name}</span>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-brand-200 bg-surface px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:border-brand-800 dark:text-brand-300">
                {first.duration_weeks
                  ? t("weekOf", { week: first.week_number, total: first.duration_weeks })
                  : t("week", { week: first.week_number })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CircleCheckBig aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
                {finished ? t("todayDone") : t("today", { done: doneCount(today) })}
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold text-brand-700 dark:text-brand-300">
                {finished ? t("card") : t("continue")}
                <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
              </span>
            </div>
          </Link>
        );
      })}
    </section>
  );
}

// =============================================================================
// حفظك — the small card; the map itself is on /hifz
// =============================================================================

/** The جزء most overdue for review first. */
export function reviewQueue(progress: Progress) {
  return [...progress.needsReview].sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

export function HifzCard({ academySlug }: { academySlug: string }) {
  const t = useTranslations("studentHome.hifz");
  const { progress } = useMyRecord(academySlug);

  const solid = progress?.cells.filter((cell) => cell.state === "solid").length ?? 0;
  const due = progress ? reviewQueue(progress)[0] : undefined;
  const learning = progress?.cells.find((cell) => cell.state === "learning");

  let line: { text: string; tone: "review" | "calm" } | null = null;
  if (progress) {
    if (due) line = { text: t("due", { juz: due.juz }), tone: "review" };
    else if (learning) line = { text: t("learning", { juz: learning.juz }), tone: "calm" };
    else if (progress.totalAyahs > 0) line = { text: t("allReviewed"), tone: "calm" };
    else line = { text: t("none"), tone: "calm" };
  }

  // 24px radius ring: the share of the thirty that are solid.
  const circumference = 2 * Math.PI * 24;
  const filled = (solid / 30) * circumference;

  return (
    <Link
      href={`/${academySlug}/hifz`}
      prefetch={false}
      className="card flex min-h-[5.5rem] items-center gap-3.5 py-3.5"
    >
      <span className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
          <circle cx="28" cy="28" r="24" fill="none" strokeWidth="6" className="stroke-surface-muted" />
          {solid > 0 && (
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              transform="rotate(-90 28 28)"
              className="stroke-brand-600 dark:stroke-brand-400"
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold text-brand-700 dark:text-brand-300">
          {progress ? solid : ""}
        </span>
      </span>
      <span className="flex min-w-0 flex-grow flex-col gap-0.5">
        <span className="font-display text-lg font-bold leading-tight">{t("title")}</span>
        <span className="text-sm text-muted-foreground">
          {progress ? t("solid", { count: solid }) : "…"}
        </span>
        {line && (
          <span
            className={`truncate text-xs font-bold ${
              line.tone === "review" ? "text-brand-800 dark:text-brand-200" : "text-muted-foreground"
            }`}
          >
            {line.text}
          </span>
        )}
      </span>
      <ChevronLeft aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground ltr:rotate-180" />
    </Link>
  );
}

// =============================================================================
// حلقاتك
// =============================================================================

export function MyCircles({
  academySlug,
  locale,
  typeLabels,
  slots,
}: {
  academySlug: string;
  locale: string;
  typeLabels: Record<string, string>;
  slots: Record<string, { daysOfWeek: number[]; startTime: string }>;
}) {
  const t = useTranslations("me");
  const tSchedule = useTranslations("schedule");
  const { data } = useMyRecord(academySlug);
  const circles = data?.circles ?? [];
  if (circles.length === 0) return null;

  return (
    <section className="card p-0">
      <h2 className="px-5 pt-5 font-display text-xl font-bold">{t("circles.title")}</h2>
      <ul className="mt-2">
        {circles.map((circle) => (
          <li key={circle.circle_id} className="border-t border-border-subtle">
            <Link
              href={`/${circle.registration_slug}`}
              prefetch={false}
              className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
            >
              <CircleWhen
                typeLabel={typeLabels[circle.circle_type] ?? circle.circle_type}
                days={(slots[circle.circle_id]?.daysOfWeek ?? []).map((day) =>
                  tSchedule(`days.${day}`),
                )}
                time={slots[circle.circle_id] ? formatTime(slots[circle.circle_id].startTime, locale) : ""}
                locale={locale}
              />
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground ltr:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// =============================================================================
// آخر تسميع
// =============================================================================

export function RecentRecitations({ academySlug, locale }: { academySlug: string; locale: string }) {
  const t = useTranslations("me");
  const tLog = useTranslations("session.log");
  const { data } = useMyRecord(academySlug);
  if (!data) return null;
  const entries = data.entries.slice(0, 5);

  return (
    <section className="card p-0">
      <h2 className="px-5 pt-5 font-display text-xl font-bold">{t("recent.title")}</h2>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm leading-relaxed text-muted-foreground">{t("recent.empty")}</p>
      ) : (
        <ul className="mt-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.session_date}-${index}`}
              className="flex items-center gap-3 border-t border-border-subtle px-5 py-3"
            >
              <div className="min-w-0 flex-grow">
                <p className="truncate text-sm font-semibold">
                  {formatRange(
                    {
                      from: { surah: entry.from_surah, ayah: entry.from_ayah },
                      to: { surah: entry.to_surah, ayah: entry.to_ayah },
                    },
                    locale,
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[tLog(`kind.${entry.kind}`), errorsLine(entry, t), whenLabel(entry.session_date, t)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className={ratingBadgeClass(entry.rating)}>
                {entry.rating ? tLog(`rating.${entry.rating}`) : t("recent.noRating")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type MeTranslate = ReturnType<typeof useTranslations<"me">>;

function errorsLine(entry: MyRecitation, t: MeTranslate) {
  const errors: string[] = [];
  if (entry.major_errors) errors.push(t("recent.errorsMajor", { count: entry.major_errors }));
  if (entry.minor_errors) errors.push(t("recent.errorsMinor", { count: entry.minor_errors }));
  return errors.join(" · ");
}

function whenLabel(sessionDate: string, t: MeTranslate) {
  const then = Date.parse(`${sessionDate}T00:00:00Z`);
  if (Number.isNaN(then)) return sessionDate;
  const now = new Date();
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - then) / 86_400_000,
  );
  if (days <= 0) return t("recent.today");
  if (days === 1) return t("recent.yesterday");
  return t("recent.daysAgo", { days });
}

function ratingBadgeClass(rating: RecitationRating | null) {
  const base = "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold";
  if (rating === "excellent" || rating === "very_good") {
    return `${base} bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100`;
  }
  return `${base} bg-surface-muted text-muted-foreground`;
}

