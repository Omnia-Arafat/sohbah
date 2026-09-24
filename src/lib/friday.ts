/**
 * تحدي الجمعة — the clock and the badges.
 *
 * THE WINDOW. The challenge runs from مغرب الخميس to مغرب الجمعة, because
 * that is when الجمعة begins and ends for these two sunnahs: ليلة الجمعة
 * belongs to it, and the time for سورة الكهف opens at the Thursday sunset.
 *
 * Maghrib is sunset, and sunset is computed here rather than fetched: the
 * challenge must open on a phone with no connection, and a prayer-times API
 * would be a runtime dependency for two instants a week. The sum is the
 * standard NOAA sunrise equation, good to a minute or two, plus a small
 * margin — close enough for "has مغرب الخميس come yet", which is the only
 * question it answers. It is NOT a prayer timetable and must not be shown as
 * one.
 *
 * Whose sunset: the reader's own. Students here live in several countries,
 * and each one's الجمعة ends at her own مغرب, so the place comes from her
 * device's timezone (the only location a page knows without asking). Unknown
 * zones fall back to Cairo, where most of the academy is.
 *
 * Every week is keyed by its Friday's date, "YYYY-MM-DD" — the same string on
 * every device and in the database, whichever side of midnight she opened it.
 */

type Place = { lat: number; lng: number };

/** One representative city per zone the academy actually meets in. */
const PLACES: Record<string, Place> = {
  "Africa/Cairo": { lat: 30.04, lng: 31.24 },
  "Asia/Riyadh": { lat: 24.71, lng: 46.68 },
  "Asia/Dubai": { lat: 25.2, lng: 55.27 },
  "Asia/Kuwait": { lat: 29.38, lng: 47.99 },
  "Asia/Qatar": { lat: 25.29, lng: 51.53 },
  "Asia/Bahrain": { lat: 26.23, lng: 50.59 },
  "Asia/Baghdad": { lat: 33.31, lng: 44.36 },
  "Asia/Amman": { lat: 31.95, lng: 35.93 },
  "Asia/Beirut": { lat: 33.89, lng: 35.5 },
  "Asia/Damascus": { lat: 33.51, lng: 36.28 },
  "Asia/Gaza": { lat: 31.5, lng: 34.47 },
  "Asia/Hebron": { lat: 31.53, lng: 35.1 },
  "Asia/Muscat": { lat: 23.59, lng: 58.41 },
  "Asia/Aden": { lat: 12.79, lng: 45.02 },
  "Africa/Khartoum": { lat: 15.5, lng: 32.56 },
  "Africa/Tripoli": { lat: 32.89, lng: 13.19 },
  "Africa/Tunis": { lat: 36.81, lng: 10.18 },
  "Africa/Algiers": { lat: 36.75, lng: 3.06 },
  "Africa/Casablanca": { lat: 33.57, lng: -7.59 },
  "Asia/Karachi": { lat: 24.86, lng: 67.01 },
  "Asia/Jakarta": { lat: -6.2, lng: 106.85 },
  "Europe/Istanbul": { lat: 41.01, lng: 28.98 },
  "Europe/London": { lat: 51.51, lng: -0.13 },
  "Europe/Berlin": { lat: 52.52, lng: 13.4 },
  "Europe/Paris": { lat: 48.86, lng: 2.35 },
  "America/New_York": { lat: 40.71, lng: -74.01 },
  "America/Toronto": { lat: 43.65, lng: -79.38 },
};

export const FALLBACK_TIMEZONE = "Africa/Cairo";

/** The zone this browser is in, or Cairo if it cannot say. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

function placeFor(timezone: string): { timezone: string; place: Place } {
  const place = PLACES[timezone];
  return place
    ? { timezone, place }
    : { timezone: FALLBACK_TIMEZONE, place: PLACES[FALLBACK_TIMEZONE] };
}

/** Minutes after sunset the challenge treats as مغرب — a safety margin. */
const MAGHRIB_MARGIN_MIN = 3;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Sunset on a calendar day at a place, as an instant. */
function sunset(dateKey: string, place: Place): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayOfYear = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000,
  );

  const lngHour = place.lng / 15;
  const t = dayOfYear + (18 - lngHour) / 24;
  const meanAnomaly = 0.9856 * t - 3.289;

  let trueLng =
    meanAnomaly +
    1.916 * Math.sin(rad(meanAnomaly)) +
    0.02 * Math.sin(rad(2 * meanAnomaly)) +
    282.634;
  trueLng = ((trueLng % 360) + 360) % 360;

  let ra = deg(Math.atan(0.91764 * Math.tan(rad(trueLng))));
  ra = ((ra % 360) + 360) % 360;
  ra += Math.floor(trueLng / 90) * 90 - Math.floor(ra / 90) * 90;
  ra /= 15;

  const sinDec = 0.39782 * Math.sin(rad(trueLng));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(place.lat))) /
    (cosDec * Math.cos(rad(place.lat)));
  // Polar day or night cannot happen at any place in PLACES; clamp anyway.
  const hourAngle = deg(Math.acos(Math.min(1, Math.max(-1, cosH)))) / 15;

  const localMean = hourAngle + ra - 0.06571 * t - 6.622;
  let utcHours = localMean - lngHour;
  // Keep the answer on the evening of THIS local day, not a day either side.
  const expected = 18 - lngHour;
  while (utcHours < expected - 12) utcHours += 24;
  while (utcHours > expected + 12) utcHours -= 24;

  return new Date(
    Date.UTC(y, m - 1, d) + (utcHours * 60 + MAGHRIB_MARGIN_MIN) * 60_000,
  );
}

/** "YYYY-MM-DD" and the weekday (0 = Sunday) of an instant in a zone. */
function localDay(now: Date, timezone: string): { key: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/** Date arithmetic on "YYYY-MM-DD" keys, in whole days. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type FridayWindow = {
  /** The Friday this week's challenge is keyed by. */
  friday: string;
  startsAt: Date;
  endsAt: Date;
  /** Between مغرب الخميس and مغرب الجمعة. */
  active: boolean;
};

/**
 * The challenge window nearest `now`: the running one if it is on, else the
 * next one to come.
 */
export function fridayWindow(now: Date, timezone: string): FridayWindow {
  const { timezone: zone, place } = placeFor(timezone);
  const today = localDay(now, zone);

  // Days until this week's Friday (5); a Friday past its مغرب rolls forward.
  let friday = addDays(today.key, (5 - today.weekday + 7) % 7);
  if (today.weekday === 5 && now >= sunset(today.key, place)) {
    friday = addDays(friday, 7);
  }

  const startsAt = sunset(addDays(friday, -1), place);
  const endsAt = sunset(friday, place);
  return { friday, startsAt, endsAt, active: now >= startsAt && now < endsAt };
}

/**
 * The Friday a supervisor lands on: the one running now, or else the last one
 * that has already begun.
 */
export function latestFriday(now: Date, timezone: string): string {
  const current = fridayWindow(now, timezone);
  return current.active ? current.friday : addDays(current.friday, -7);
}

/** A "YYYY-MM-DD" that is really a Friday — guards a URL parameter. */
export function isFridayKey(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10) === value && date.getUTCDay() === 5;
}

// ---------------------------------------------------------------------------
// سورة الكهف
// ---------------------------------------------------------------------------

/** The مصحف pages الكهف occupies, first and last inclusive. */
export const KAHF_FIRST_PAGE = 293;
export const KAHF_LAST_PAGE = 304;
export const KAHF_PAGES = KAHF_LAST_PAGE - KAHF_FIRST_PAGE + 1;
/** Every page read, as the bitmask the database stores. */
export const KAHF_ALL = (1 << KAHF_PAGES) - 1;

export function isKahfPage(page: number): boolean {
  return page >= KAHF_FIRST_PAGE && page <= KAHF_LAST_PAGE;
}

export function kahfBit(page: number): number {
  return 1 << (page - KAHF_FIRST_PAGE);
}

export function kahfCount(mask: number): number {
  let count = 0;
  for (let bit = 0; bit < KAHF_PAGES; bit++) if (mask & (1 << bit)) count++;
  return count;
}

/** The first page not yet read, or null once all twelve are. */
export function kahfNextPage(mask: number): number | null {
  for (let bit = 0; bit < KAHF_PAGES; bit++) {
    if (!(mask & (1 << bit))) return KAHF_FIRST_PAGE + bit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The badges
// ---------------------------------------------------------------------------

/**
 * A badge at ٥٠, at ١٠٠, and at every hundred after that, for good.
 */
export function isMilestone(count: number): boolean {
  return count === 50 || (count >= 100 && count % 100 === 0);
}

export function nextMilestone(count: number): number {
  if (count < 50) return 50;
  if (count < 100) return 100;
  return (Math.floor(count / 100) + 1) * 100;
}

export function previousMilestone(count: number): number {
  if (count < 50) return 0;
  if (count < 100) return 50;
  return Math.floor(count / 100) * 100;
}

/** The highest badge a count has earned, or 0 for none yet. */
export function topMilestone(count: number): number {
  return previousMilestone(count);
}

/** Every badge a count has earned, lowest first. */
export function earnedMilestones(count: number): number[] {
  const out: number[] = [];
  if (count >= 50) out.push(50);
  for (let m = 100; m <= count; m += 100) out.push(m);
  return out;
}


/**
 * A number as the challenge prints it: Arabic digits in Arabic, and NO
 * thousands separator. «١٬٢٠٠» and "1,200" both read as a list, not a count,
 * on a badge or a tally.
 */
export function formatCount(n: number, locale: string): string {
  return n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", { useGrouping: false });
}
