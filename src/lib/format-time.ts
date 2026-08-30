/**
 * `circles.start_time` comes back from Postgres as a 24-hour `HH:mm:ss` string.
 * Readers expect a clock, not a timestamp, so format it in place rather than
 * routing through `Date`/`Intl` — no date means no timezone to get wrong.
 */
export function formatTime(time: string, locale: string): string {
  const [rawHour, rawMinute] = String(time).split(":");
  const hour24 = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return String(time);

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const clock = minute === 0 ? `${hour12}` : `${hour12}:${String(minute).padStart(2, "0")}`;
  const isPm = hour24 >= 12;

  if (locale === "ar") return `${clock} ${isPm ? "م" : "ص"}`;
  return `${clock} ${isPm ? "PM" : "AM"}`;
}
