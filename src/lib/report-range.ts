import { DEFAULT_TIMEZONE } from "./timezones";

export const REPORT_MODES = ["week", "month", "year", "all", "custom"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];

export type ReportRange = {
  mode: ReportMode;
  /** Inclusive `YYYY-MM-DD`, matching `attendance_report(p_from, p_to)`. */
  from: string;
  to: string;
  /**
   * Echoes back what the picker for the active mode should show — including
   * a sensible default when nothing valid was in the URL — so the form
   * always matches the range it just resolved.
   */
  month: string; // `YYYY-MM`, used by the week and month pickers.
  week: number; // 1-5, used by the week picker.
  year: string; // `YYYY`, used by the year picker.
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const ISO_YEAR = /^\d{4}$/;

/**
 * "Today" has to mean today where the circles actually run, not wherever the
 * server happens to be. `session_date` is written in each circle's timezone by
 * `join_circle()`, so the report boundaries are derived the same way.
 */
function todayInTimezone(timeZone: string): string {
  // en-CA gives ISO-ordered YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function isValidMonth(value: string): boolean {
  if (!ISO_MONTH.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isValidYear(value: string): boolean {
  return ISO_YEAR.test(value) && Number(value) >= 2020 && Number(value) <= 2100;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isReportMode(value: string | undefined): value is ReportMode {
  return REPORT_MODES.includes(value as ReportMode);
}

/**
 * Resolves the query string into a concrete inclusive range. Anything invalid
 * silently falls back to a sensible default rather than erroring, since these
 * values arrive straight from a user-editable URL.
 */
export function resolveRange(
  params: {
    mode?: string;
    month?: string;
    weekMonth?: string;
    week?: string;
    year?: string;
    from?: string;
    to?: string;
  },
  timeZone: string = DEFAULT_TIMEZONE,
): ReportRange {
  const today = todayInTimezone(timeZone);
  const defaultMonth = today.slice(0, 7);
  const defaultYear = today.slice(0, 4);
  const mode: ReportMode = isReportMode(params.mode) ? params.mode : "month";

  // The week and month pickers submit under different field names (see
  // reports/page.tsx) but resolve to the same kind of value here.
  const monthSource = mode === "week" ? params.weekMonth : params.month;
  const month = monthSource && isValidMonth(monthSource) ? monthSource : defaultMonth;
  const year = params.year && isValidYear(params.year) ? params.year : defaultYear;

  switch (mode) {
    case "week": {
      const weekNum = Number(params.week);
      const week = Number.isInteger(weekNum) && weekNum >= 1 && weekNum <= 4 ? weekNum : 1;
      const lastDay = daysInMonth(month);
      // Weeks 1-3 are plain 7-day slices; week 4 absorbs whatever is left
      // over (21-28, 29, 30 or 31), so every day of the month always falls
      // in exactly one week and there is never a 5th, near-empty option.
      const startDay = Math.min((week - 1) * 7 + 1, lastDay);
      const endDay = week === 4 ? lastDay : week * 7;
      return {
        mode,
        from: `${month}-${pad2(startDay)}`,
        to: `${month}-${pad2(endDay)}`,
        month,
        week,
        year,
      };
    }
    case "year":
      return { mode, from: `${year}-01-01`, to: `${year}-12-31`, month, week: 1, year };
    case "all":
      // No circle predates this, so it is an unconditional lower bound rather
      // than something derived per academy — simpler, and never wrong.
      return { mode, from: "2020-01-01", to: today, month, week: 1, year };
    case "custom": {
      const from = params.from && isValidDate(params.from) ? params.from : today;
      const to = params.to && isValidDate(params.to) ? params.to : today;
      // Tolerate a reversed range instead of returning nothing.
      return from <= to
        ? { mode, from, to, month, week: 1, year }
        : { mode, from: to, to: from, month, week: 1, year };
    }
    case "month":
    default:
      return {
        mode: "month",
        from: `${month}-01`,
        to: `${month}-${pad2(daysInMonth(month))}`,
        month,
        week: 1,
        year,
      };
  }
}
