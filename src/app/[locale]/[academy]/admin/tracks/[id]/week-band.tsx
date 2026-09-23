"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronLeft, Crosshair } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { TrackWeek } from "@/lib/track-detail-dal";

/**
 * Forty weeks, one of them focused.
 *
 * The grid rendered all forty — twenty rows on a phone, and most of the page's
 * scroll spent on weeks finished months ago. This follows the same shape as
 * the حلقات screens: the one whose turn it is stands alone and full size, and
 * the rest are a strip you flip through, forward or back.
 *
 * "Whose turn it is" is the week the track's cohorts are actually sitting at,
 * not week 1 — that is the week she opens to fill.
 */
export function WeekBand({
  weeks,
  academySlug,
  trackId,
  currentWeek,
}: {
  weeks: TrackWeek[];
  academySlug: string;
  trackId: string;
  /** Where the cohorts are. Null before any of them has started. */
  currentWeek: number | null;
}) {
  const t = useTranslations("track");

  const startIndex = Math.max(
    0,
    weeks.findIndex((w) => w.weekNumber === (currentWeek ?? 1)),
  );
  const [index, setIndex] = useState(startIndex);

  const focused = weeks[index];
  const stripRef = useRef<HTMLUListElement>(null);
  const firstPaint = useRef(true);

  // Keep the focused chip in view when the arrows move past the edge of the
  // strip — and land there without an animation on the first paint, so the
  // page does not open mid-scroll.
  useEffect(() => {
    const chip = stripRef.current?.children[index] as HTMLElement | undefined;
    chip?.scrollIntoView({
      behavior: firstPaint.current ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
    firstPaint.current = false;
  }, [index]);

  if (!focused) return null;

  const atCurrent = currentWeek !== null && focused.weekNumber === currentWeek;

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-3">
        {/* In RTL the earlier weeks sit to the right, so the chevron that
            means "back" is the one pointing that way. */}
        <Step
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0}
          label={t("prevWeek")}
          direction="prev"
        />

        <div className="min-w-0 flex-grow text-center">
          <p className="font-display text-xl font-bold">
            {t("weekN", { n: focused.weekNumber })}
          </p>
          <p
            className={`mt-0.5 text-xs ${
              focused.filledDays === 0
                ? "text-muted-foreground"
                : "font-semibold text-brand-700 dark:text-brand-300"
            }`}
          >
            {focused.filledDays === 0
              ? t("empty")
              : t("daysFilled", {
                  filled: focused.filledDays,
                  total: focused.totalDays,
                })}
          </p>
        </div>

        <Step
          onClick={() => setIndex((i) => i + 1)}
          disabled={index === weeks.length - 1}
          label={t("nextWeek")}
          direction="next"
        />
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3 sm:flex-row-reverse">
        <Link
          href={`/${academySlug}/admin/tracks/${trackId}/weeks/${focused.weekNumber}`}
          className="btn-primary flex-grow text-center"
        >
          {t("openWeek")}
        </Link>
        {!atCurrent && currentWeek !== null && (
          <button
            type="button"
            onClick={() => setIndex(startIndex)}
            className="btn-secondary flex shrink-0 items-center justify-center gap-1.5"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            {t("jumpToWeek", { n: currentWeek })}
          </button>
        )}
      </div>

      {/* The other thirty-nine. Draggable on a phone, and each one is a tap
          rather than a link: tapping moves the focus, it does not leave. */}
      <ul
        ref={stripRef}
        className="flex gap-1.5 overflow-x-auto border-t border-border-subtle px-3 py-2.5"
      >
        {weeks.map((week, i) => (
          <li key={week.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index}
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl border text-xs font-semibold tabular-nums transition-colors ${
                i === index
                  ? "border-brand-600 bg-brand-600 text-white"
                  : week.isPublished
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/50 dark:text-brand-100"
                    : "border-border-subtle text-muted-foreground"
              }`}
            >
              {week.weekNumber}
              {week.weekNumber === currentWeek && (
                <span
                  aria-hidden
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    i === index ? "bg-white" : "bg-accent-500"
                  }`}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Step({
  onClick,
  disabled,
  label,
  direction,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  direction: "prev" | "next";
}) {
  const Icon = direction === "prev" ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle transition-colors hover:border-brand-600 disabled:opacity-40 disabled:hover:border-border-subtle"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
