"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DateField } from "@/components/date-field";
import { MeetingScores } from "@/components/meeting-scores";

type Row = {
  enrollment_id: string;
  student_name: string;
  partner_name: string | null;
  reported: boolean;
  recited_new: boolean;
  recited_review: boolean;
  heard_recitation: boolean;
  prayed_with_memorised: boolean;
  recorded_by_name?: string | null;
  can_edit?: boolean;
};

type CardKey = (typeof COLUMNS)[number]["key"];

/** The card's own order, and which two the academy counts. */
const COLUMNS = [
  { key: "recited_new", core: true },
  { key: "recited_review", core: true },
  { key: "heard_recitation", core: false },
  { key: "prayed_with_memorised", core: false },
] as const;

/**
 * One cohort, one day: who reported what.
 *
 * Read on the client so the date can change without a round trip through the
 * server component — a معلمة checking who is behind moves between days more
 * than she opens the page.
 */
export type DayBoardCohort = {
  trackName: string;
  cohortName: string;
  teacherName: string | null;
  startDate: string;
  durationWeeks: number;
};

/** Moves a YYYY-MM-DD date by whole days, in UTC so no timezone shifts it. */
function shiftDay(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function DayBoard({
  cohortId,
  teacherId,
  initialDate,
  cohort,
}: {
  cohortId: string;
  teacherId: string | null;
  initialDate: string;
  cohort: DayBoardCohort | null;
}) {
  const t = useTranslations("cohortDay");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  if (loadedFor !== date) {
    setLoadedFor(date);
    setSaveError(false);
    void (async () => {
      const args = { p_cohort_id: cohortId, p_date: date } as never;
      const board = await supabase.rpc("cohort_day_board" as never, args);
      if (!board.error) {
        setRows((board.data ?? []) as unknown as Row[]);
        return;
      }
      // Until RUN_STEPS_STAFF_REPORT_TRACK_DAY.sql is applied: read-only board.
      const { data } = await supabase.rpc("cohort_day_reports" as never, args);
      setRows((data ?? []) as unknown as Row[]);
    })();
  }

  async function toggle(row: Row, key: CardKey) {
    if (!row.can_edit || saving) return;
    const next = { ...row, [key]: !row[key] };
    const any =
      next.recited_new || next.recited_review || next.heard_recitation || next.prayed_with_memorised;
    const forDate = date;
    setSaving(row.enrollment_id);
    setSaveError(false);
    setRows((current) =>
      (current ?? []).map((r) =>
        r.enrollment_id === row.enrollment_id
          ? { ...next, reported: any, recorded_by_name: any ? t("you") : null }
          : r,
      ),
    );
    const { error } = await supabase.rpc("staff_report_track_day" as never, {
      p_enrollment_id: row.enrollment_id,
      p_session_date: forDate,
      p_recited_new: next.recited_new,
      p_recited_review: next.recited_review,
      p_heard: next.heard_recitation,
      p_prayed: next.prayed_with_memorised,
    } as never);
    setSaving(null);
    if (error) {
      console.error("staff_report_track_day failed", error);
      setSaveError(true);
      setRows((current) =>
        (current ?? []).map((r) => (r.enrollment_id === row.enrollment_id ? row : r)),
      );
    }
  }

  const editable = (rows ?? []).some((r) => r.can_edit);

  // Only the two required ones count as "behind". An optional item left blank
  // is not a shortfall and must never be presented as one.
  const behind = (rows ?? []).filter(
    (r) => !(r.recited_new && r.recited_review),
  ).length;
  const reported = (rows ?? []).filter((r) => r.reported).length;
  const done = (rows ?? []).length - behind;

  /*
    Which day this is, said in full: the weekday, the date, the week of the
    track it falls in, and whether it is the لقاء — the cohort's week starts on
    its start date's weekday, which is the meeting (see tracks_runtime).
  */
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  const dayLabel = picked
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(picked)
    : "";
  const sinceStart =
    picked && cohort
      ? Math.floor((picked.getTime() - Date.parse(`${cohort.startDate}T00:00:00Z`)) / 86_400_000)
      : null;
  const week =
    sinceStart !== null && sinceStart >= 0 && cohort
      ? Math.min(Math.floor(sinceStart / 7) + 1, cohort.durationWeeks)
      : null;
  const isMeeting = sinceStart !== null && sinceStart >= 0 && sinceStart % 7 === 0;

  return (
    <div className="flex flex-col gap-4">
      {cohort && (
        <section className="rounded-2xl bg-brand-900 px-4 py-3.5 text-white">
          <p className="font-display text-xl font-bold">
            {cohort.trackName} · {cohort.cohortName}
          </p>
          <p className="mt-0.5 text-sm text-brand-100">
            {cohort.teacherName ? t("teacher", { name: cohort.teacherName }) : t("noTeacher")}
          </p>
        </section>
      )}

      <div>
        <label className="field-label" htmlFor="day">
          {t("day")}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDate(shiftDay(date, -1))}
            aria-label={t("prevDay")}
            className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5 ltr:rotate-180" />
          </button>
          <div className="min-w-0 flex-grow">
            <DateField id="day" value={date} onChange={setDate} />
          </div>
          <button
            type="button"
            onClick={() => setDate(shiftDay(date, 1))}
            aria-label={t("nextDay")}
            className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-brand-700 dark:text-brand-300"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5 ltr:rotate-180" />
          </button>
        </div>
        {dayLabel && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <span>{dayLabel}</span>
            {week !== null && <span className="text-muted-foreground">· {t("week", { week })}</span>}
            {isMeeting && (
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                {t("meeting")}
              </span>
            )}
          </p>
        )}
      </div>

      {editable && (
        <p className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
          {t("editHint")}
        </p>
      )}

      {saveError && (
        <p role="alert" className="rounded-2xl border border-absent px-4 py-3 text-xs font-bold text-absent">
          {t("saveFailed")}
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <p className="rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-sm font-bold">
          {t("summary", { reported, total: rows.length, done })}
        </p>
      )}

      {rows !== null && rows.length > 0 && reported === 0 && (
        <p className="rounded-2xl border border-border-subtle bg-surface-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t("noneReported")}
        </p>
      )}

      {rows !== null && reported > 0 && behind > 0 && (
        <p className="rounded-2xl border border-accent-300 bg-accent-100 px-4 py-3 text-xs font-bold text-accent-700 dark:border-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
          {t("behind", { count: behind })}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-end gap-2 border-b border-border-subtle bg-surface-muted px-3 py-2">
          <span className="flex-grow text-[11px] font-bold text-muted-foreground">
            {t("student")}
          </span>
          {COLUMNS.map(({ key }) => (
            <span
              key={key}
              className="w-9 shrink-0 text-center text-[10px] leading-tight text-muted-foreground"
            >
              {t(`short.${key}`)}
            </span>
          ))}
        </div>

        {rows === null ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li
                key={row.enrollment_id}
                className={`flex items-center gap-2 border-t border-border-subtle px-3 py-2 first:border-t-0 ${
                  row.reported ? "" : "opacity-60"
                }`}
              >
                <span className="min-w-0 flex-grow">
                  <span className="block truncate text-[13px] font-semibold">
                    {row.student_name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {row.reported
                      ? row.partner_name ?? t("noPartner")
                      : t("notReported")}
                  </span>
                  {row.reported && row.recorded_by_name && (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-bold text-accent-700 dark:text-accent-200">
                      <PenLine className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {t("recordedBy", { name: row.recorded_by_name })}
                    </span>
                  )}
                </span>

                {COLUMNS.map(({ key, core }) => {
                  const on = row[key];
                  /*
                    Three states, told apart by SHAPE as well as colour: done
                    is filled, a missing required one is a gold ring, and an
                    optional blank is a flat dash. A reader who cannot
                    separate green from amber still reads this row.
                  */
                  const cls = on
                    ? "bg-brand-600 text-white"
                    : core
                      ? "border-2 border-accent-500 text-accent-700 dark:text-accent-200"
                      : "bg-surface-muted text-muted-foreground";
                  const Cell = row.can_edit ? "button" : "span";
                  return (
                    <Cell
                      key={key}
                      {...(row.can_edit
                        ? {
                            type: "button" as const,
                            onClick: () => void toggle(row, key),
                            disabled: saving !== null,
                            "aria-pressed": on,
                          }
                        : {})}
                      title={t(`items.${key}`)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${cls} ${
                        row.can_edit ? "cursor-pointer transition active:scale-95 disabled:opacity-60" : ""
                      }`}
                    >
                      {on ? (
                        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                      ) : core ? (
                        ""
                      ) : (
                        "–"
                      )}
                      <span className="sr-only">
                        {t(on ? "doneLabel" : core ? "missingLabel" : "blankLabel", {
                          item: t(`items.${key}`),
                        })}
                      </span>
                    </Cell>
                  );
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-4 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
        <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <span aria-hidden className="h-5 w-5 rounded-md bg-brand-600" /> {t("legendDone")}
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <span aria-hidden className="h-5 w-5 rounded-md border-2 border-accent-500" />{" "}
          {t("legendMissing")}
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <span aria-hidden className="h-5 w-5 rounded-md bg-surface-muted" />{" "}
          {t("legendBlank")}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>

      {week !== null && cohort && rows !== null && (
        <MeetingScores
          cohortId={cohortId}
          week={week}
          meetingDate={shiftDay(cohort.startDate, (week - 1) * 7)}
          students={rows}
          canEdit={editable}
          teacherId={teacherId}
        />
      )}
    </div>
  );
}
