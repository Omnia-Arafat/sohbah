"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";

/** The week as the academy says it, from Saturday: JS weekday numbers. */
const WEEK = [6, 0, 1, 2, 3, 4, 5] as const;

function parse(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * A cohort's start date, with its يوم اللقاء as a choice of its own.
 *
 * A cohort's week starts on the weekday of its start date, and that day is the
 * لقاء (day_index 0 in the database): every student's "today" and every week
 * number are counted from it. So a cohort that meets on Saturday but was
 * entered with a Wednesday start shows every student the wrong day — and the
 * only way to fix it was to know which date to pick in a date picker.
 *
 * Picking a weekday here moves the start date to the nearest day that is that
 * weekday, at most three days either way, so the cohort stays in the week it
 * was in. Nothing new is stored: the date is still the one source of truth.
 */
export function CohortStartPicker({
  initial,
  today,
  durationWeeks,
  label,
}: {
  initial: string;
  /** The academy's today (YYYY-MM-DD), so the week shown matches the database. */
  today: string;
  durationWeeks?: number;
  label: string;
}) {
  const t = useTranslations("cohortMeeting");
  const locale = useLocale();
  const [startDate, setStartDate] = useState(initial);

  const start = parse(startDate);
  const weekdayFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
  const dayFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  // A sample date for each weekday, only to print its name.
  const nameOf = (dow: number) => weekdayFormat.format(new Date(Date.UTC(2026, 0, 4 + dow)));

  function pickWeekday(dow: number) {
    const base = start ?? parse(today) ?? new Date();
    let shift = (dow - base.getUTCDay() + 7) % 7;
    if (shift > 3) shift -= 7;
    const moved = new Date(base);
    moved.setUTCDate(moved.getUTCDate() + shift);
    setStartDate(iso(moved));
  }

  const preview = (() => {
    if (!start) return null;
    const now = parse(today);
    const weekday = weekdayFormat.format(start);
    if (!now) return null;
    const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    if (days < 0) return t("previewFuture", { date: dayFormat.format(start), weekday });
    const week = Math.floor(days / 7) + 1;
    return t("preview", {
      week: durationWeeks ? Math.min(week, durationWeeks) : week,
      weekday,
    });
  })();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="field-label" htmlFor="startDate">
          {label}
        </label>
        <DateField id="startDate" name="startDate" value={startDate} onChange={setStartDate} required />
      </div>

      <fieldset className="min-w-0">
        <legend className="field-label">{t("label")}</legend>
        <div className="mt-1 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {WEEK.map((dow) => {
            const selected = start?.getUTCDay() === dow;
            return (
              <button
                key={dow}
                type="button"
                onClick={() => pickWeekday(dow)}
                aria-pressed={selected}
                className={`min-h-11 rounded-xl border px-1 text-sm font-semibold transition-colors ${
                  selected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-border-subtle bg-surface hover:border-brand-600"
                }`}
              >
                {nameOf(dow)}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("hint")}</p>
      </fieldset>

      {preview && (
        <p className="rounded-lg bg-surface-muted px-2.5 py-2 text-xs leading-relaxed text-foreground/80">
          {preview}
        </p>
      )}
    </div>
  );
}
