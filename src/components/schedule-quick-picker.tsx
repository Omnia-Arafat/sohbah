"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { arNum, encodeSheet } from "@/lib/schedule-format";

export type QuickCohort = {
  trackId: string;
  cohortId: string;
  label: string;
  currentWeek: number;
  durationWeeks: number;
};

/** «أسبوع تاني أو دفعة تانية…»: pick a cohort and a week, then download it. */
export function ScheduleQuickPicker({
  academySlug,
  cohorts,
  backHref,
}: {
  academySlug: string;
  cohorts: QuickCohort[];
  backHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const cohort = cohorts[idx];
  const [week, setWeek] = useState(cohort.currentWeek);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-xl border-[1.5px] border-white/55 font-extrabold"
      >
        أسبوع تاني أو دفعة تانية…
      </button>
    );
  }

  const href = `/${academySlug}/print/schedule?s=${encodeSheet({ trackId: cohort.trackId, cohort: cohort.cohortId, week })}&back=${encodeURIComponent(backHref)}`;

  return (
    <div role="dialog" aria-label="اختاري الجدول" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 text-foreground">
      <div className="flex items-center justify-between">
        <span className="font-black">نزّلي جدول</span>
        <button type="button" aria-label="إغلاق" onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-xl bg-surface-muted">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div role="radiogroup" aria-label="الدفعة" className="flex flex-wrap gap-1.5">
        {cohorts.map((c, i) => (
          <button
            key={c.cohortId}
            type="button"
            role="radio"
            aria-checked={i === idx}
            onClick={() => {
              setIdx(i);
              setWeek(c.currentWeek);
            }}
            className={`min-h-10 rounded-full px-3 text-sm font-extrabold ${
              i === idx ? "bg-maroon-600 text-white" : "border-[1.5px] border-border-subtle bg-surface"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-extrabold text-muted-foreground">الأسبوع</span>
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
          {Array.from({ length: cohort.durationWeeks }, (_, i) => {
            const n = i + 1;
            const look =
              n === week
                ? "bg-brand-600 text-white"
                : n === cohort.currentWeek
                  ? "border-[1.5px] border-maroon-600 bg-maroon-100 text-maroon-600"
                  : n < cohort.currentWeek
                    ? "bg-lime-100 text-brand-700"
                    : "border border-dashed border-border-subtle text-muted-foreground";
            return (
              <button
                key={n}
                type="button"
                aria-label={`الأسبوع ${arNum(n)}`}
                aria-pressed={n === week}
                onClick={() => setWeek(n)}
                className={`h-8 rounded-lg text-xs font-extrabold ${look}`}
              >
                {arNum(n)}
              </button>
            );
          })}
        </div>
      </div>

      <Link href={href} className="btn-primary">
        <Download className="size-5" aria-hidden="true" />
        نزّلي الأسبوع {arNum(week)}
      </Link>
    </div>
  );
}
