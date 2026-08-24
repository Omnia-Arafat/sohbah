import { DEFAULT_TIMEZONE } from "./timezones";

export const RANGE_PRESETS = ["today", "week", "month", "year", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type ReportRange = {
  preset: RangePreset;
  /** Inclusive `YYYY-MM-DD`, matching `attendance_report(p_from, p_to)`. */
  from: string;
  to: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // UTC arithmetic on a date-only value: no DST shift can move the result.
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

export function isRangePreset(value: string | undefined): value is RangePreset {
  return RANGE_PRESETS.includes(value as RangePreset);
}

/**
 * Resolves the query string into a concrete inclusive range. Anything invalid
 * silently falls back to the month preset rather than erroring, since these
 * values arrive straight from a user-editable URL.
 */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  timeZone: string = DEFAULT_TIMEZONE,
): ReportRange {
  const today = todayInTimezone(timeZone);

  if (params.range === "custom") {
    const from = params.from && isValidDate(params.from) ? params.from : today;
    const to = params.to && isValidDate(params.to) ? params.to : today;
    // Tolerate a reversed range instead of returning nothing.
    return from <= to
      ? { preset: "custom", from, to }
      : { preset: "custom", from: to, to: from };
  }

  const preset: RangePreset = isRangePreset(params.range) ? params.range : "month";

  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week":
      // Rolling 7 days including today; avoids arguing about which day starts
      // the week, which differs between the Gregorian and local conventions.
      return { preset, from: addDays(today, -6), to: today };
    case "year":
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "month":
    default:
      return { preset: "month", from: `${today.slice(0, 7)}-01`, to: today };
  }
}
