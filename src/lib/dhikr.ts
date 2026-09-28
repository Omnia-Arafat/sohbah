/**
 * تحديات الأذكار — the catalog, the badges, and the clock.
 *
 * THE CATALOG is nine adhkar whose virtue is in an authentic hadith, each
 * with its source and grade written out. Every badge family is a picture of
 * that virtue — غراس الجنة grows a tree, the كنز opens a chest, the حرز builds
 * a fortress — so the badge says what the ذكر is for before anyone reads it.
 * The texts were checked against their sources (see the canvas «تحديات
 * الأذكار — المخطط»); one popular narration was left out as weak.
 *
 * A معلمة can also write her own ذكر. The source is then REQUIRED, by the
 * form and by the table: no hadith is published here without saying who
 * narrated it.
 *
 * THE BADGE has four stages, at a quarter, half, three quarters and all of
 * the goal. It is drawn from the count and never stored.
 */

import type { BadgeDrawing, Primitive } from "@/lib/friday-badges";

export const FAMILIES = [
  "tree",
  "palm",
  "treasure",
  "sea",
  "scale",
  "fortress",
  "scroll",
  "sky",
  "leaf",
] as const;
export type Family = (typeof FAMILIES)[number];

export type Period = "day" | "week" | "once";

export type Preset = {
  id: Family;
  title: string;
  dhikr: string;
  virtue: string;
  source: string;
  /** Default goal and period when a معلمة picks it. */
  goal: number;
};

export const PRESETS: Preset[] = [
  {
    id: "tree",
    title: "غراس الجنة",
    dhikr: "سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر",
    virtue:
      "«…وأخبرهم أن الجنة طيبة التربة، عذبة الماء، وأنها قيعان، وأن غراسها: سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر»",
    source: "رواه الترمذي عن ابن مسعود، وحسّنه الألباني",
    goal: 100,
  },
  {
    id: "palm",
    title: "نخلة في الجنة",
    dhikr: "سبحان الله العظيم وبحمده",
    virtue: "«من قال: سبحان الله العظيم وبحمده، غُرست له نخلة في الجنة»",
    source: "رواه الترمذي (٣٤٦٤) عن جابر، وصححه الألباني",
    goal: 100,
  },
  {
    id: "treasure",
    title: "كنز من كنوز الجنة",
    dhikr: "لا حول ولا قوة إلا بالله",
    virtue: "«ألا أدلك على كنز من كنوز الجنة؟ لا حول ولا قوة إلا بالله»",
    source: "رواه البخاري (٦٣٨٤) ومسلم (٢٧٠٤) عن أبي موسى",
    goal: 100,
  },
  {
    id: "sea",
    title: "مثل زبد البحر",
    dhikr: "سبحان الله وبحمده",
    virtue: "«من قال: سبحان الله وبحمده، في يوم مائة مرة، حُطّت خطاياه وإن كانت مثل زبد البحر»",
    source: "رواه البخاري (٦٤٠٥) ومسلم (٢٦٩١) عن أبي هريرة",
    goal: 100,
  },
  {
    id: "scale",
    title: "ثقيلتان في الميزان",
    dhikr: "سبحان الله وبحمده، سبحان الله العظيم",
    virtue: "«كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن»",
    source: "رواه البخاري (٦٤٠٦) ومسلم (٢٦٩٤) عن أبي هريرة",
    goal: 100,
  },
  {
    id: "fortress",
    title: "حرز من الشيطان",
    dhikr: "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير",
    virtue:
      "«من قالها في يوم مائة مرة… كانت له حرزًا من الشيطان يومه ذلك حتى يمسي، ولم يأت أحد بأفضل مما جاء به إلا أحد عمل أكثر من ذلك»",
    source: "رواه البخاري (٣٢٩٣) ومسلم (٢٦٩١) عن أبي هريرة",
    goal: 100,
  },
  {
    id: "scroll",
    title: "صحيفة الاستغفار",
    dhikr: "أستغفر الله وأتوب إليه",
    virtue: "«طوبى لمن وجد في صحيفته استغفارًا كثيرًا»",
    source: "رواه ابن ماجه (٣٨١٨) عن عبد الله بن بسر، وصححه الألباني",
    goal: 100,
  },
  {
    id: "sky",
    title: "تملآن ما بين السماء والأرض",
    dhikr: "سبحان الله، والحمد لله",
    virtue: "«والحمد لله تملأ الميزان، وسبحان الله والحمد لله تملآن ما بين السماوات والأرض»",
    source: "رواه مسلم (٢٢٣) عن أبي مالك الأشعري",
    goal: 100,
  },
  {
    id: "leaf",
    title: "الصلاة على النبي ﷺ",
    dhikr: "اللهم صلِّ وسلِّم على نبينا محمد",
    virtue: "«من صلّى عليّ واحدة، صلّى الله عليه عشرًا»",
    source: "رواه مسلم (٤٠٨) عن أبي هريرة",
    goal: 100,
  },
];

export function presetFor(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function isFamily(value: string): value is Family {
  return (FAMILIES as readonly string[]).includes(value);
}

/** What each stage of each badge is called, from a quarter to done. */
export const STAGE_NAMES: Record<Family, [string, string, string, string]> = {
  tree: ["بذرة", "نبتة", "شتلة", "شجرة"],
  palm: ["نواة", "فسيلة", "نخلة", "نخلة مثمرة"],
  treasure: ["صندوق", "المفتاح", "يتفتح", "كنز"],
  sea: ["موجة", "تصفى", "تلمع", "بحر صافي"],
  scale: ["الكفتين", "ترجح", "تثقل", "ثقيلة"],
  fortress: ["الأساس", "السور", "الأبراج", "حصن"],
  scroll: ["سطر", "سطور", "صحيفة", "مختومة"],
  sky: ["نجمة", "نجوم", "هلال", "تملأ السماء"],
  leaf: ["ورقة", "ورقتين", "غصن", "تاج"],
};

export const FAMILY_NAMES: Record<Family, string> = {
  tree: "الشجرة",
  palm: "النخلة",
  treasure: "الكنز",
  sea: "البحر",
  scale: "الميزان",
  fortress: "الحصن",
  scroll: "الصحيفة",
  sky: "السماء",
  leaf: "الورقة",
};

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Where a count stands against its goal.
 *
 * Past the goal a new round starts — for غراس الجنة that is a second tree,
 * because the hadith is about planting and planting does not stop at one.
 * `stage` is 0 (not started) to 4 (done) within the current round; exactly
 * on a finished round it stays 4 rather than dropping back to an empty seed.
 */
export function progressOf(count: number, goal: number) {
  const rounds = Math.floor(count / goal);
  const within = count % goal;
  const stage = count > 0 && within === 0 ? 4 : Math.min(3, Math.floor((within / goal) * 4));
  const pct = count > 0 && within === 0 ? 100 : Math.round((within / goal) * 100);
  return { rounds, stage: stage as 0 | 1 | 2 | 3 | 4, pct };
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

function localDateKey(now: Date, timezone: string): { key: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

function minusDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/**
 * The period a count belongs to: today, this week (from Saturday, as the
 * week runs here), or a single fixed key for a challenge that never resets.
 */
export function periodKey(period: Period, now: Date, timezone: string): string {
  if (period === "once") return "2000-01-01";
  const today = localDateKey(now, timezone);
  if (period === "day") return today.key;
  return minusDays(today.key, (today.weekday + 1) % 7);
}

// ---------------------------------------------------------------------------
// The badges — nine families, four stages each, in a 64-unit box
// ---------------------------------------------------------------------------

const GOLD = "#e0b04f";
const SL = "M0 0 C4 -3 5 -8 0 -12 C-5 -8 -4 -3 0 0 Z";
const BIG = "M32 6 C47 17 51 37 32 60 C13 37 17 17 32 6 Z";
const FROND = "M0 0 C4 -6 10 -9 17 -8 C11 -6 5 -3 0 0 Z";

type Opt = { stroke?: string; sw?: number; t?: string; op?: number };
const path = (d: string, fill: string, o: Opt = {}): Primitive => ({
  kind: "path",
  d,
  fill,
  stroke: o.stroke,
  strokeWidth: o.sw,
  transform: o.t,
  opacity: o.op,
});
const circ = (cx: number, cy: number, r: number, fill: string, o: Opt = {}): Primitive => ({
  kind: "circle",
  cx,
  cy,
  r,
  fill,
  stroke: o.stroke,
  strokeWidth: o.sw,
  opacity: o.op,
});
const rect = (x: number, y: number, w: number, h: number, rx: number, fill: string, o: Opt = {}): Primitive => ({
  kind: "rect",
  x,
  y,
  w,
  h,
  rx,
  fill,
  stroke: o.stroke,
  strokeWidth: o.sw,
  opacity: o.op,
});
const tf = (x: number, y: number, a: number, s: number, mirror = false) =>
  `translate(${x} ${y})${mirror ? " scale(-1 1)" : ""} rotate(${a}) scale(${s})`;
const star = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3} Z`;
const ground = () => rect(10, 52, 44, 4, 2, "#d8ccb0");

type Stage = 1 | 2 | 3 | 4;

const DRAW: Record<Family, (s: Stage) => Primitive[]> = {
  // الصلاة على النبي — the leaf, the crown fanning out.
  leaf(s) {
    const at = (a: number, sc: number) => `translate(32 58) rotate(${a}) scale(${sc}) translate(-32 -60)`;
    const fans: [number, number][][] = [[], [[34, 0.66]], [[34, 0.66], [64, 0.52]], [[32, 0.68], [62, 0.54], [88, 0.42]]];
    const out: Primitive[] = [];
    fans[s - 1].forEach(([a, sc], i) => {
      const fill = i % 2 ? "#8cc63f" : "#2f8a2f";
      const op = 0.55 - i * 0.08;
      out.push(path(BIG, fill, { t: at(-a, sc), op }), path(BIG, fill, { t: at(a, sc), op }));
    });
    out.push(path(BIG, "#2f8a2f", { t: at(0, 0.8), stroke: "#1f661f", sw: 1.2 }));
    out.push(path("M32 18 L32 56", "none", { stroke: "#ffffff", sw: 1.2, op: 0.35 }));
    return out;
  },

  // غراس الجنة — seed, sprout, sapling, tree.
  tree(s) {
    const out: Primitive[] = [ground()];
    if (s === 1) {
      out.push(circ(32, 48.5, 4.2, "#8a4f2e"), path("M31 45.5 Q33.5 48.5 31 51.5", "none", { stroke: "#d8ccb0", sw: 1 }));
    } else if (s === 2) {
      out.push(
        path("M32 52 L32 40", "none", { stroke: "#2f8a2f", sw: 2.4 }),
        path(SL, "#3f9a3a", { t: tf(32, 42, -52, 1.3) }),
        path(SL, "#3f9a3a", { t: tf(32, 42, 52, 1.3) }),
      );
    } else if (s === 3) {
      out.push(path("M32 52 L32 24", "none", { stroke: "#2f8a2f", sw: 2.4 }));
      for (const [y, a, sc, c] of [
        [46, 58, 1.25, "#3f9a3a"],
        [37, 50, 1.15, "#8cc63f"],
        [28, 45, 1.05, "#3f9a3a"],
      ] as [number, number, number, string][]) {
        out.push(path(SL, c, { t: tf(32, y, -a, sc) }), path(SL, c, { t: tf(32, y, a, sc) }));
      }
      out.push(path(SL, "#8cc63f", { t: tf(32, 25, 0, 1.05) }));
    } else {
      out.push(
        path("M29 53 L30.5 34 L33.5 34 L35 53 Z", "#8a4f2e"),
        path("M32 38 L25 31 M32 36 L39 29", "none", { stroke: "#8a4f2e", sw: 2 }),
        circ(21, 28, 9, "#3f9a3a"),
        circ(43, 28, 9, "#3f9a3a"),
        circ(32, 22, 12, "#2f8a2f"),
        circ(26, 15, 8, "#8cc63f"),
        circ(38, 15, 8, "#8cc63f"),
        circ(32, 27, 8, "#3f9a3a"),
        circ(23, 26, 1.7, GOLD),
        circ(41, 24, 1.7, GOLD),
        circ(33, 16, 1.7, GOLD),
      );
    }
    return out;
  },

  // نخلة في الجنة — date stone, offshoot, palm, fruiting palm.
  palm(s) {
    const out: Primitive[] = [ground()];
    const fronds = (x: number, y: number, angles: number[], sc: number) =>
      angles.forEach((a, i) => {
        const c = i % 2 ? "#8cc63f" : "#5e8f22";
        out.push(path(FROND, c, { t: tf(x, y, a, sc) }), path(FROND, c, { t: tf(x, y, a, sc, true) }));
      });
    if (s === 1) {
      out.push(
        path("M32 43 C36 43 36.5 52 32 52 C27.5 52 28 43 32 43 Z", "#8a5a1c"),
        path("M32 45 L32 50", "none", { stroke: "#d8ccb0", sw: 1 }),
      );
    } else if (s === 2) {
      fronds(32, 51, [-40, -75], 0.85);
    } else if (s === 3) {
      out.push(
        rect(29.5, 36, 5, 17, 2, "#8a5a1c"),
        path("M29.5 41 H34.5 M29.5 45 H34.5 M29.5 49 H34.5", "none", { stroke: "#664213", sw: 1 }),
      );
      fronds(32, 36, [-55, -20, 12], 1.1);
    } else {
      out.push(
        path("M30 53 C30 40 30.5 30 31 19 L33 19 C33.5 30 34 40 34 53 Z", "#8a5a1c"),
        path("M30.4 26 H33.4 M30.3 32 H33.6 M30.2 38 H33.8 M30.1 44 H33.9", "none", { stroke: "#664213", sw: 1 }),
      );
      fronds(32, 19, [-62, -32, -4, 24], 1.35);
      out.push(
        circ(29.5, 23, 1.9, "#b5501a"),
        circ(34.5, 23, 1.9, "#b5501a"),
        circ(32, 25.2, 1.9, "#d0662b"),
        circ(28, 26, 1.7, "#d0662b"),
        circ(36, 26, 1.7, "#b5501a"),
      );
    }
    return out;
  },

  // كنز من كنوز الجنة — a locked chest that opens and fills.
  treasure(s) {
    const out: Primitive[] = [];
    const box = () => [
      rect(15, 34, 34, 18, 3, "#8a4f2e", { stroke: "#65391f", sw: 1 }),
      rect(15, 40, 34, 2.5, 0, GOLD),
      rect(22, 34, 2.5, 18, 0, GOLD),
      rect(39.5, 34, 2.5, 18, 0, GOLD),
    ];
    const coin = (x: number, y: number) => circ(x, y, 3, GOLD, { stroke: "#8a6420", sw: 0.8 });
    if (s <= 2) {
      out.push(
        ...box(),
        path("M15 34 C15 23 49 23 49 34 Z", "#a0603a", { stroke: "#65391f", sw: 1 }),
        rect(29, 31, 6, 7, 1.5, s === 1 ? "#8b938e" : GOLD),
        circ(32, 34, 1.2, "#3d2a08"),
      );
      if (s === 2) out.push(coin(10, 50), coin(54, 50), path(star(52, 22, 4), GOLD));
    } else {
      out.push(path("M15 34 L19 19 L45 19 L49 34 Z", "#a0603a", { stroke: "#65391f", sw: 1 }), rect(17, 31, 30, 4, 1, "#3d2a08"));
      [21, 27, 33, 39, 45].forEach((x) => out.push(coin(x, 32.5)));
      out.push(...box());
      if (s === 4) {
        [24, 30, 36, 42].forEach((x) => out.push(coin(x, 28)));
        [27, 33, 39].forEach((x) => out.push(coin(x, 23.5)));
        out.push(
          coin(33, 19),
          coin(9, 50),
          coin(55, 50),
          coin(49, 54),
          path(star(10, 20, 4), GOLD),
          path(star(54, 13, 5), GOLD),
          path(star(20, 9, 3), GOLD),
        );
      }
    }
    return out;
  },

  // مثل زبد البحر — the foam clears and the sea brightens.
  sea(s) {
    const water = ["#6f9095", "#4a8a92", "#27808b", "#0f7481"][s - 1];
    const out: Primitive[] = [
      path("M6 30 Q12 25 18 30 T30 30 T42 30 T54 30 L58 30 L58 50 Q58 56 52 56 L12 56 Q6 56 6 50 Z", water),
      path("M6 30 Q12 25 18 30 T30 30 T42 30 T54 30", "none", { stroke: "#ffffff", sw: 1.6, op: 0.75 }),
      path("M10 42 Q16 38 22 42 T34 42 T46 42 T56 42", "none", { stroke: "#ffffff", sw: 1.2, op: 0.35 }),
    ];
    const foam = [[14, 35], [24, 37], [36, 35], [47, 37], [18, 47], [30, 48], [42, 47], [52, 45]];
    foam.slice(0, [8, 5, 2, 0][s - 1]).forEach(([x, y]) => out.push(circ(x, y, 2.4, "#b8bfbc")));
    if (s >= 3) out.push(path(star(22, 46, 3), "#ffffff", { op: 0.9 }));
    if (s === 4) out.push(circ(46, 15, 6.5, GOLD), path(star(40, 40, 3.5), "#ffffff"), path(star(15, 18, 2.5), GOLD));
    return out;
  },

  // ثقيلتان في الميزان — the scale tips further each stage.
  scale(s) {
    const a = ([0, 7, 13, 19][s - 1] * Math.PI) / 180;
    const L = 19;
    const rx = +(32 + L * Math.cos(a)).toFixed(1);
    const ry = +(16 + L * Math.sin(a)).toFixed(1);
    const lx = +(32 - L * Math.cos(a)).toFixed(1);
    const ly = +(16 - L * Math.sin(a)).toFixed(1);
    const pan = (x: number, y: number) => [
      path(`M${x} ${y} L${x - 8} ${y + 13} M${x} ${y} L${x + 8} ${y + 13}`, "none", { stroke: "#15467f", sw: 1 }),
      path(`M${x - 9.5} ${y + 13} Q${x} ${y + 21} ${x + 9.5} ${y + 13} Z`, "#1f5fa8"),
    ];
    const out: Primitive[] = [];
    if (s === 4) out.push(circ(rx, ry + 12, 13, GOLD, { op: 0.25 }));
    out.push(
      rect(30.5, 14, 3, 38, 1.5, "#15467f"),
      path("M22 57 L42 57 L38 51 L26 51 Z", "#15467f"),
      path(`M${lx} ${ly} L${rx} ${ry}`, "none", { stroke: "#1f5fa8", sw: 3 }),
      circ(32, 13, 2.6, "#1f5fa8"),
      ...pan(lx, ly),
      ...pan(rx, ry),
    );
    const heap = [[0, 10.5], [-4, 11], [4, 11], [-2, 7], [2, 7]];
    heap.slice(0, [1, 2, 3, 5][s - 1]).forEach(([dx, dy]) =>
      out.push(circ(rx + dx, ry + dy, 2.3, GOLD, { stroke: "#8a6420", sw: 0.6 })),
    );
    return out;
  },

  // حرز من الشيطان — the fortress goes up, stone by stone.
  fortress(s) {
    const STONE = "#d8c7a3";
    const EDGE = "#9c8454";
    const M = "#7a1f3d";
    const out: Primitive[] = [rect(6, 52, 52, 4, 2, "#cbbf9f")];
    if (s === 1) {
      [12, 21, 30, 39, 48].forEach((x) => out.push(rect(x - 2, 46, 8.5, 6, 1, STONE, { stroke: EDGE, sw: 0.8 })));
      [16.5, 25.5, 34.5, 43.5].forEach((x) => out.push(rect(x - 2, 41, 8.5, 5, 1, STONE, { stroke: EDGE, sw: 0.8, op: 0.9 })));
      return out;
    }
    out.push(
      rect(12, 34, 40, 18, 1, STONE, { stroke: EDGE, sw: 1 }),
      path("M12 40 H52 M12 46 H52 M20 34 V40 M32 34 V40 M44 34 V40 M26 40 V46 M38 40 V46 M20 46 V52 M44 46 V52", "none", {
        stroke: EDGE,
        sw: 0.7,
      }),
    );
    if (s >= 3) {
      out.push(
        rect(7, 24, 11, 28, 1, STONE, { stroke: EDGE, sw: 1 }),
        rect(46, 24, 11, 28, 1, STONE, { stroke: EDGE, sw: 1 }),
        path("M28 52 L28 44 Q32 38 36 44 L36 52 Z", M),
        rect(11, 30, 3, 5, 1, "#5a4a2c"),
        rect(50, 30, 3, 5, 1, "#5a4a2c"),
      );
      [7, 11.5, 16].forEach((x) => out.push(rect(x, 20.5, 2.6, 4, 0.5, STONE, { stroke: EDGE, sw: 0.7 })));
      [46, 50.5, 55].forEach((x) => out.push(rect(x - 0.6, 20.5, 2.6, 4, 0.5, STONE, { stroke: EDGE, sw: 0.7 })));
    }
    if (s === 4) {
      out.push(rect(24, 18, 16, 16, 1, STONE, { stroke: EDGE, sw: 1 }), rect(30, 24, 4, 6, 2, "#5a4a2c"));
      [24, 29, 34.6].forEach((x) => out.push(rect(x, 14.5, 3.4, 4, 0.5, STONE, { stroke: EDGE, sw: 0.7 })));
      out.push(path("M32 14.5 L32 5", "none", { stroke: "#5a4a2c", sw: 1.2 }), path("M32 5 L40 7.5 L32 10 Z", M));
    }
    return out;
  },

  // صحيفة الاستغفار — the page fills, then is sealed.
  scroll(s) {
    const out: Primitive[] = [
      rect(14, 10, 36, 44, 3, "#fbf3df", { stroke: "#b89a5a", sw: 1.2 }),
      rect(11, 7, 42, 6, 3, "#e8d6ab", { stroke: "#b89a5a", sw: 1 }),
      rect(11, 51, 42, 6, 3, "#e8d6ab", { stroke: "#b89a5a", sw: 1 }),
    ];
    const n = [2, 4, 7, 7][s - 1];
    for (let i = 0; i < n; i++) {
      out.push(rect(i % 2 ? 22 : 19, 17 + i * 4.3, i % 2 ? 23 : 26, 1.8, 0.9, "#6d3aa3", { op: 0.8 }));
    }
    if (s === 4) out.push(circ(42, 45, 5.6, "#6d3aa3"), path(star(42, 45, 3.2), "#fbf3df"));
    return out;
  },

  // تملآن ما بين السماء والأرض — the night fills with light.
  sky(s) {
    const out: Primitive[] = [
      rect(6, 6, 52, 52, 14, "#12382c"),
      path("M6 44 Q22 36 38 42 T58 40 L58 50 Q58 58 50 58 L14 58 Q6 58 6 50 Z", "#1e6e51"),
    ];
    const stars = [[16, 16], [28, 12], [20, 28], [34, 24], [12, 36], [26, 34], [40, 32], [50, 34], [14, 22], [38, 12], [30, 30], [22, 20], [46, 26], [52, 12]];
    stars
      .slice(0, [1, 4, 8, 14][s - 1])
      .forEach(([x, y], i) => out.push(path(star(x, y, i % 3 ? 2 : 2.8), i % 2 ? "#ffffff" : "#f3d27a")));
    if (s === 3) out.push(circ(44, 18, 6, GOLD), circ(46.6, 16.4, 5.2, "#12382c"));
    if (s === 4) out.push(circ(44, 18, 11, GOLD, { op: 0.22 }), circ(44, 18, 7, "#f3d27a"));
    return out;
  },
};

/** One badge at one stage. Stage 0 is the first stage greyed out. */
export function drawDhikrBadge(family: Family, stage: number): BadgeDrawing {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  const parts =
    s === 0
      ? DRAW[family](1).map((p): Primitive => {
          if (p.kind === "text") return p;
          return {
            ...p,
            fill: p.fill === "none" ? "none" : "#dfe5e1",
            stroke: p.stroke ? "#b9c2bd" : undefined,
            opacity: 0.8,
          };
        })
      : DRAW[family](s as Stage);
  return { viewBox: "0 0 64 64", aspect: 1, parts };
}
