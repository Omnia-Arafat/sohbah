"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  enrollment_id: string;
  student_name: string;
  partner_name: string | null;
  reported: boolean;
  recited_new: boolean;
  recited_review: boolean;
  heard_recitation: boolean;
  prayed_with_memorised: boolean;
};

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
export function DayBoard({
  cohortId,
  initialDate,
}: {
  cohortId: string;
  initialDate: string;
}) {
  const t = useTranslations("cohortDay");
  const supabase = useMemo(() => createClient(), []);

  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (loadedFor !== date) {
    setLoadedFor(date);
    void (async () => {
      const { data } = await supabase.rpc("cohort_day_reports" as never, {
        p_cohort_id: cohortId,
        p_date: date,
      } as never);
      setRows((data ?? []) as unknown as Row[]);
    })();
  }

  // Only the two required ones count as "behind". An optional item left blank
  // is not a shortfall and must never be presented as one.
  const behind = (rows ?? []).filter(
    (r) => !(r.recited_new && r.recited_review),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-grow">
          <label className="field-label" htmlFor="day">
            {t("day")}
          </label>
          <input
            id="day"
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      {rows !== null && behind > 0 && (
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
                className="flex items-center gap-2 border-t border-border-subtle px-3 py-2 first:border-t-0"
              >
                <span className="min-w-0 flex-grow">
                  <span className="block truncate text-[13px] font-semibold">
                    {row.student_name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {row.partner_name ?? t("noPartner")}
                  </span>
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
                  return (
                    <span
                      key={key}
                      title={t(`items.${key}`)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${cls}`}
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
                    </span>
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
    </div>
  );
}
