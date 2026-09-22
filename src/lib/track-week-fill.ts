/**
 * Filling a week's starts from its ends.
 *
 * THE WEEK IS CUMULATIVE, NOT A MOVING WINDOW. From the academy's own sheets:
 *
 *     اليوم الأول   سورة الجن ١:٧
 *     اليوم الثاني  سورة الجن ١:١٣
 *     اليوم الثالث  سورة الجن ١:٢٢
 *
 *     الثلاثاء  سورة البقرة من ٢٠٣:٢٠٦
 *     الأربعاء  سورة البقرة من ٢٠٣:٢١١
 *     الخميس    سورة البقرة من ٢٠٣:٢١٣
 *
 * Every day begins at the SAME ayah — the start of the ربع or surah the week
 * is built on — and only the end grows, because she recites the whole of it
 * from the beginning each day. That is التثبيت.
 *
 * So a day's start is emphatically NOT the previous day's end plus one:
 * filling it that way gives five disjoint fragments, none of which is the
 * week. Only the jump BETWEEN weeks moves forward, which is what
 * `continueFrom` carries.
 *
 * Lives here rather than inside the form so the check in
 * scripts/check-week-fill.mjs runs this exact function — the first version of
 * it left day one's end surah blank whenever the start came from last week,
 * and the save then refused the week as incomplete.
 */

export type WeekDraft = {
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
};

export type AyahRef = { surah: number; ayah: number };

/** 1..5 are the memorisation days; 0 is the meeting and 6 is Friday. */
export const MEMORISE_DAYS = [1, 2, 3, 4, 5] as const;

export function fillWeekStarts<T extends WeekDraft>(
  days: readonly T[],
  continueFrom: AyahRef | null,
): T[] {
  const next = [...days];

  // The week's one start: what she typed on day one, else last week's end.
  const first = next[1];
  const start: AyahRef | null =
    first?.fromSurah && first?.fromAyah
      ? { surah: Number(first.fromSurah), ayah: Number(first.fromAyah) }
      : continueFrom;

  if (!start) return next;

  // Every memorisation day is filled the same way, day one included.
  for (const i of MEMORISE_DAYS) {
    const day = next[i];
    if (!day) continue;
    // Only a day that carries an end is part of this week; an untouched day
    // stays untouched rather than gaining a start it will never use.
    if (!day.toAyah) continue;

    next[i] = {
      ...day,
      fromSurah: day.fromSurah || String(start.surah),
      fromAyah: day.fromAyah || String(start.ayah),
      // The end sits in the same surah as the start unless she says
      // otherwise, which is true of every week that stays inside one.
      toSurah: day.toSurah || String(start.surah),
    };
  }

  return next;
}
