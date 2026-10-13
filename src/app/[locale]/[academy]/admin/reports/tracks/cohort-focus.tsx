"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scoreTone, type CohortView } from "@/lib/track-report-view";

/** One دفعة at a time, students down and weeks across, with arrows to flip. */
export function CohortFocus({ cohorts }: { cohorts: CohortView[] }) {
  const t = useTranslations("trackReport.focus");
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const n = cohorts.length;
  const cohort = cohorts[Math.min(index, n - 1)];
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", { maximumFractionDigits: 1 });
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (!cohort) return null;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface lg:flex-[999_1_640px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{cohort.trackName}</p>
          <h2 className="font-display text-2xl font-bold sm:text-[28px]">{cohort.name}</h2>
          <p className="text-sm text-muted-foreground">
            {cohort.teacherName ? `${cohort.teacherName} · ` : ""}
            {t("students", { count: cohort.students })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-brand-50 px-3 py-1.5 text-center dark:bg-brand-900/40">
            <div className="text-xl font-extrabold leading-tight text-brand-700 tabular-nums dark:text-brand-200">
              {cohort.average === null ? "—" : num.format(cohort.average)}
            </div>
            <div className="text-[11px] text-muted-foreground">{t("average")}</div>
          </div>
          {n > 1 && (
            <>
              <button
                type="button"
                aria-label={t("prev")}
                onClick={() => setIndex((i) => (i + n - 1) % n)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
              >
                <ChevronRight className="h-5 w-5 ltr:rotate-180" aria-hidden="true" />
              </button>
              <span className="min-w-14 text-center text-sm font-bold tabular-nums">
                {t("position", { current: num.format(index + 1), total: num.format(n) })}
              </span>
              <button
                type="button"
                aria-label={t("next")}
                onClick={() => setIndex((i) => (i + 1) % n)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
              >
                <ChevronLeft className="h-5 w-5 ltr:rotate-180" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-muted text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 text-start text-[13px] font-bold sm:px-5">
                {t("student")}
              </th>
              {cohort.weeks.map((w) => (
                <th key={w.week} scope="col" className="w-24 px-2 py-2.5 text-center text-[13px] font-bold">
                  {t("week", { week: num.format(w.week) })}
                  <div className="text-[11px] font-normal">
                    {w.open
                      ? t("running")
                      : `${day.format(new Date(`${w.from}T00:00:00Z`))} – ${day.format(new Date(`${w.to}T00:00:00Z`))}`}
                  </div>
                </th>
              ))}
              <th scope="col" className="w-24 px-4 py-2.5 text-center text-[13px] font-bold sm:px-5">
                {t("total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {cohort.rows.map((row) => (
              <tr key={row.enrollmentId} className="border-t border-border-subtle">
                <th scope="row" className="px-4 py-2.5 text-start font-semibold sm:px-5">
                  {row.name}
                </th>
                {row.cells.map((cell, i) => {
                  if (!cell || cell.max === 0) {
                    return (
                      <td key={i} className="px-2 py-1.5 text-center text-muted-foreground">
                        —
                      </td>
                    );
                  }
                  const tone = scoreTone(cell.total, cell.max);
                  return (
                    <td key={i} className="px-2 py-1.5 text-center">
                      <span
                        className="inline-flex h-8 min-w-[68px] items-center justify-center rounded-lg px-1.5 font-bold tabular-nums"
                        style={
                          cell.open
                            ? { border: "1.5px dashed #8A9A91", color: "var(--muted-foreground)" }
                            : { background: tone.bg, color: tone.fg }
                        }
                      >
                        {num.format(cell.total)} / {num.format(cell.max)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center font-extrabold tabular-nums sm:px-5">
                  {row.maxPoints > 0 ? `${num.format(row.points)} / ${num.format(row.maxPoints)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:px-5">
        {(
          [
            ["#12382C", t("legend.full")],
            ["#2F7D5B", t("legend.high")],
            ["#A8D9C2", t("legend.mid")],
            ["#EFE4C2", t("legend.low")],
            ["#F4D9D6", t("legend.poor")],
          ] as const
        ).map(([color, text]) => (
          <span key={text} className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded" style={{ background: color }} aria-hidden="true" />
            {text}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border-[1.5px] border-dashed border-[#8A9A91]" aria-hidden="true" />
          {t("legend.open")}
        </span>
      </div>
    </section>
  );
}
