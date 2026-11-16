/**
 * Shared, pure helpers for the weekly schedule screens and the printed sheet.
 * No data access here, so both server and client components can use it.
 *
 * day_index, as tracks.sql defines it:
 *   0 = لقاء المعلمة · 1..5 = اليوم الأول..الخامس · 6 = الجمعة
 */

import { surahByNumber } from "@/lib/quran/surahs";

export type ScheduleDay = {
  dayIndex: number;
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  review: string;
  notes: string;
};

export type ScheduleWeek = {
  id: string;
  trackId: string;
  cohortId: string | null;
  weekNumber: number;
  title: string;
  isPublished: boolean;
  meetingWeekday: number | null;
  meetingTime: string;
  days: ScheduleDay[];
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function arNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

export const DAY_NAMES = [
  "لقاء المعلمة",
  "اليوم الأول",
  "اليوم الثاني",
  "اليوم الثالث",
  "اليوم الرابع",
  "اليوم الخامس",
  "الجمعة",
] as const;

/** JavaScript getDay order: 0 = Sunday. */
export const WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

const ORDINALS = [
  "",
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];

/** «الأول» for 1..10, the digits after that: «الأسبوع ٢٤» reads fine. */
export function weekWord(n: number): string {
  return ORDINALS[n] ?? arNum(n);
}

/** The leaf colour for day 1..5, light to deep: the week growing. */
export const DAY_LEAF = ["#c9e27a", "#b3d65a", "#9bc93b", "#4ca03a", "#2f7d32"] as const;

export function emptyDays(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    fromSurah: null,
    fromAyah: null,
    toSurah: null,
    toAyah: null,
    review: "",
    notes: "",
  }));
}

export function hasRange(d: ScheduleDay): boolean {
  return d.fromSurah !== null && d.fromAyah !== null && d.toSurah !== null && d.toAyah !== null;
}

export function surahName(n: number | null): string {
  if (n === null) return "";
  return surahByNumber(n)?.name ?? "";
}

/** «(١ : ١١)» within one surah; «المائدة ١ – الأنعام ٥» across two. */
export function rangeText(d: ScheduleDay): string {
  if (!hasRange(d)) return "";
  // Read left to right, as the printed schedules write it: «(١ : ١١)» with the
  // first ayah on the left. The LRI…PDI isolate keeps it that way inside
  // Arabic text, where the bidi algorithm would otherwise flip it to (١١ : ١).
  if (d.fromSurah === d.toSurah) return `⁦(${arNum(d.fromAyah!)} : ${arNum(d.toAyah!)})⁩`;
  return `(${surahName(d.fromSurah)} ${arNum(d.fromAyah!)} – ${surahName(d.toSurah)} ${arNum(d.toAyah!)})`;
}

/** The surah the week is about: the one most of its days memorise from. */
export function weekSurah(days: ScheduleDay[]): number | null {
  const counts = new Map<number, number>();
  for (const d of days) {
    if (d.dayIndex < 1 || d.dayIndex > 5 || d.fromSurah === null) continue;
    counts.set(d.fromSurah, (counts.get(d.fromSurah) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [s, c] of counts) {
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

/** Whether a week has anything written in it beyond the empty seed rows. */
export function weekHasContent(days: ScheduleDay[]): boolean {
  return days.some((d) => hasRange(d) || d.review.trim() !== "" || d.notes.trim() !== "");
}

/**
 * The line under «لقاء المعلمة»: «السبت · ٨ م بتوقيت القاهرة». The week's own
 * values first; then the weekday a cohort started on, which is the day its
 * meetings fall (my_track_week's meeting_day).
 */
export function meetingLine(
  week: Pick<ScheduleWeek, "meetingWeekday" | "meetingTime">,
  cohortStartDate?: string | null,
): string {
  let weekday = week.meetingWeekday;
  if (weekday === null && cohortStartDate) {
    weekday = new Date(`${cohortStartDate}T00:00:00Z`).getUTCDay();
  }
  const parts = [weekday !== null ? WEEKDAYS[weekday] : "", week.meetingTime.trim()];
  return parts.filter(Boolean).join(" · ");
}

/** Which week a cohort is on today. Same arithmetic as track-detail-dal. */
export function cohortWeek(startDate: string, durationWeeks: number, now = Date.now()): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const days = Math.floor((now - start) / 86_400_000);
  if (days < 0) return 1;
  return Math.max(1, Math.min(Math.floor(days / 7) + 1, durationWeeks));
}

/**
 * One printed sheet: which schedule, and what its header says. `cohort` is the
 * cohort id, or "base" for the track's shared schedule. Encoded in the print
 * URL as `trackId.cohort.week`.
 */
export type SheetRef = { trackId: string; cohort: string; week: number };

export function encodeSheet(s: SheetRef): string {
  return `${s.trackId}.${s.cohort}.${s.week}`;
}

export function decodeSheet(raw: string): SheetRef | null {
  const [trackId, cohort, week] = raw.split(".");
  const n = Number(week);
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(trackId ?? "") || !(cohort === "base" || uuid.test(cohort ?? ""))) return null;
  if (!Number.isInteger(n) || n < 1 || n > 200) return null;
  return { trackId, cohort, week: n };
}
