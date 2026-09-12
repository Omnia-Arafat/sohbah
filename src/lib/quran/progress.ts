import {
  absoluteAyah,
  asJuzAndPages,
  juzLength,
  type AyahRange,
} from "./reference";
import { JUZ_COUNT, JUZ_STARTS } from "./structure";

/**
 * Turns a student's recitation log into the thing she actually wants to see.
 *
 * WHY A JUZ MAP AND NOT A PROGRESS BAR:
 *
 * A bar of 604 pages moves invisibly — a good week shifts it by a millimetre —
 * and "١٨٪" is a number nobody feels. Thirty cells is a shape she can hold in
 * her head and watch fill in.
 *
 * WHY CELLS CAN GO BACKWARDS:
 *
 * A counter that only rises is a vanity metric, and the research on streak
 * gamification says the pull fades in six to eight weeks and the person stops
 * at whatever number they reached. A جزء she has not touched in a month DIMS
 * here. That is the truth about her حفظ, and it is what makes "اختبري حفظك"
 * worth pressing — the map asks her for something.
 */

/** One recorded turn, as far as this file is concerned. */
export type RecitationEntry = {
  session_date: string;
  from_surah: number;
  from_ayah: number;
  to_surah: number;
  to_ayah: number;
};

export type JuzState = "untouched" | "learning" | "fading" | "solid";

export type JuzCell = {
  juz: number;
  /** Ayat of this جزء she has recited at least once. */
  covered: number;
  total: number;
  /** Days since she last recited anything in it; null when she never has. */
  daysSince: number | null;
  state: JuzState;
};

/**
 * A جزء untouched for this long is shown faded.
 *
 * Chosen against how these circles actually run: a student recites weekly, so
 * a مراجعة cycle that has not come round in a month has slipped rather than
 * merely being queued. Short enough to be actionable, long enough not to nag
 * someone who is on schedule.
 */
export const FADE_AFTER_DAYS = 30;

/** Complete enough to count as hers rather than as work in progress. */
const SOLID_FRACTION = 0.95;

export type Progress = {
  cells: JuzCell[];
  /** Distinct ayat recited at least once, across the whole mushaf. */
  totalAyahs: number;
  /** The same, said the way a حافظة says it: "٧ أجزاء و١٢ صفحة". */
  totalSpan: { juz: number; pages: number };
  /** أجزاء she holds that have gone quiet — what the review card names. */
  needsReview: JuzCell[];
  sessions: number;
};

/** The absolute ayah number each جزء opens on, plus the end of the mushaf. */
const JUZ_BOUNDS: readonly number[] = [
  ...JUZ_STARTS.map(([surah, ayah]) => absoluteAyah({ surah, ayah })),
  absoluteAyah({ surah: 114, ayah: 6 }) + 1,
];

export function buildProgress(
  entries: readonly RecitationEntry[],
  today: Date = new Date(),
): Progress {
  // One pass over the log, into one set of absolute ayah numbers.
  //
  // A union, not a sum: reciting the same page three times is confirmation,
  // not three pages, and adding the lengths would have a student "finish" the
  // Quran by reviewing جزء عم all year. The set is bounded at 6236 whatever
  // the size of the log.
  const recited = new Set<number>();
  const lastTouched = new Map<number, number>();

  for (const entry of entries) {
    const range: AyahRange = {
      from: { surah: entry.from_surah, ayah: entry.from_ayah },
      to: { surah: entry.to_surah, ayah: entry.to_ayah },
    };
    const from = absoluteAyah(range.from);
    const to = absoluteAyah(range.to);
    if (from === 0 || to === 0 || to < from) continue;

    for (let position = from; position <= to; position++) recited.add(position);

    const days = daysBetween(entry.session_date, today);
    if (days === null) continue;

    for (let juz = juzAt(from); juz <= juzAt(to); juz++) {
      const current = lastTouched.get(juz);
      if (current === undefined || days < current) lastTouched.set(juz, days);
    }
  }

  const cells: JuzCell[] = [];
  for (let juz = 1; juz <= JUZ_COUNT; juz++) {
    const start = JUZ_BOUNDS[juz - 1];
    const end = JUZ_BOUNDS[juz];

    let covered = 0;
    for (let position = start; position < end; position++) {
      if (recited.has(position)) covered++;
    }

    const daysSince = lastTouched.get(juz) ?? null;
    cells.push({
      juz,
      covered,
      total: juzLength(juz),
      daysSince,
      state: stateOf(covered, juzLength(juz), daysSince),
    });
  }

  return {
    cells,
    totalAyahs: recited.size,
    totalSpan: asJuzAndPages(recited.size),
    needsReview: cells.filter((cell) => cell.state === "fading"),
    sessions: entries.length,
  };
}

function stateOf(
  covered: number,
  total: number,
  daysSince: number | null,
): JuzState {
  if (covered === 0) return "untouched";
  if (covered < total * SOLID_FRACTION) return "learning";
  if (daysSince !== null && daysSince > FADE_AFTER_DAYS) return "fading";
  return "solid";
}

/** Which جزء an absolute ayah number falls in. */
function juzAt(position: number): number {
  let low = 0;
  let high = JUZ_COUNT - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JUZ_BOUNDS[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** Whole days between a stored `YYYY-MM-DD` and today; null if unparseable. */
function daysBetween(sessionDate: string, today: Date): number | null {
  const then = Date.parse(`${sessionDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.floor((now - then) / 86_400_000);
}
