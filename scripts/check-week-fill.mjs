// Check the week editor's fill against the academy's own printed schedules.
//
//   node --experimental-strip-types scripts/check-week-fill.mjs
//
// There is no test runner in this project, and adding one for a single pure
// function would be more machinery than the function. This imports the real
// fillWeekStarts — not a copy — so it cannot drift from what ships.
//
// It exists because the first version of that function was wrong in a way
// only a real schedule reveals: it carried each day's start from the previous
// day's END, which is how most memorisation works but not how this academy's
// does. And the correction was wrong in turn, leaving day one's end surah
// blank whenever the start came from the previous week.

import { fillWeekStarts, MEMORISE_DAYS } from "../src/lib/track-week-fill.ts";

const blank = () => ({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });

function check(label, typed, continueFrom, expected) {
  const days = Array.from({ length: 7 }, blank);
  for (const [i, patch] of Object.entries(typed)) {
    Object.assign(days[Number(i)], patch);
  }

  const filled = fillWeekStarts(days, continueFrom);
  const got = MEMORISE_DAYS.map((i) => {
    const d = filled[i];
    return `${d.fromSurah}:${d.fromAyah}-${d.toSurah}:${d.toAyah}`;
  });

  const ok = got.every((g, i) => g === expected[i]);
  console.log(`\n${ok ? "OK  " : "FAIL"} ${label}`);
  for (const [i, g] of got.entries()) {
    if (g === expected[i]) console.log(`       day ${i + 1}: ${g}`);
    else console.log(`     ✗ day ${i + 1}: ${g}   expected ${expected[i]}`);
  }
  return ok;
}

// المسار الأول، الأسبوع الرابع عشر — البقرة، كل يوم من ٢٠٣
// ٢٠٣:٢٠٦ · ٢٠٣:٢١١ · ٢٠٣:٢١٣ · ٢٠٣:٢١٦ · ٢٠٣:٢١٨
const first = check(
  "المسار الأول · week 14 — she types the start and five ends",
  {
    1: { fromSurah: "2", fromAyah: "203", toSurah: "2", toAyah: "206" },
    2: { toAyah: "211" },
    3: { toAyah: "213" },
    4: { toAyah: "216" },
    5: { toAyah: "218" },
  },
  null,
  ["2:203-2:206", "2:203-2:211", "2:203-2:213", "2:203-2:216", "2:203-2:218"],
);

// المسار السادس، الأسبوع الثالث عشر — الجن، كل يوم من ١
// ١:٧ · ١:١٣ · ١:٢٢ · ١:٢٨ · ١:٢٨   (the last two are deliberately equal)
const sixth = check(
  "المسار السادس · week 13 — two days ending at the same ayah",
  {
    1: { fromSurah: "72", fromAyah: "1", toSurah: "72", toAyah: "7" },
    2: { toAyah: "13" },
    3: { toAyah: "22" },
    4: { toAyah: "28" },
    5: { toAyah: "28" },
  },
  null,
  ["72:1-72:7", "72:1-72:13", "72:1-72:22", "72:1-72:28", "72:1-72:28"],
);

// The same week with day one's start left to the button, carried from the
// previous week. This is the case that was broken.
const carried = check(
  "المسار السادس · week 13 — start carried from last week",
  {
    1: { toAyah: "7" },
    2: { toAyah: "13" },
    3: { toAyah: "22" },
    4: { toAyah: "28" },
    5: { toAyah: "28" },
  },
  { surah: 72, ayah: 1 },
  ["72:1-72:7", "72:1-72:13", "72:1-72:22", "72:1-72:28", "72:1-72:28"],
);

// A week she has only half filled: days without an end are left alone rather
// than given a start they will never use.
const partial = check(
  "a half-entered week — untouched days stay untouched",
  {
    1: { fromSurah: "2", fromAyah: "203", toSurah: "2", toAyah: "206" },
    2: { toAyah: "211" },
  },
  null,
  ["2:203-2:206", "2:203-2:211", ":-:", ":-:", ":-:"],
);

const all = [first, sixth, carried, partial].every(Boolean);
console.log(`\n${all ? "All four match." : "Something differs — see above."}`);
process.exitCode = all ? 0 : 1;
