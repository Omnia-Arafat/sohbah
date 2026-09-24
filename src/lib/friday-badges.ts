/**
 * How a تحدي الجمعة badge looks.
 *
 * WHICH SHAPE. Three were drawn from صحبة's own logo — the tree of leaves over
 * the raised hands — and «الورقة» was chosen (canvas: شارة صحبة — اختيارات).
 * The other two are kept, working, on purpose: the database stores only the
 * COUNT, never a badge, so every badge is drawn afresh from its number each
 * time it is shown. Changing `BADGE_SHAPE` below therefore redraws every badge
 * anyone has ever earned, in the app and on the share image, with nothing to
 * migrate.
 *
 * NOT the eight-pointed star: that is إتقان's mark (public/brand/mark.svg),
 * and an earlier draft of this feature wore it by mistake.
 *
 * Everything here is plain data — a list of primitives in a 64-unit box — so
 * the React component and the share image draw exactly the same badge.
 */

export type BadgeShape = "leaf" | "crown" | "grow";

/** The one line to change to switch every badge to another shape. */
export const BADGE_SHAPE: BadgeShape = "leaf";

type Tone = { fill: string; edge: string; ink: string };

/**
 * A colour per number, so a badge is recognised before it is read.
 *
 * The greens are the logo's leaves, ٥٠٠ is the maroon of «So7bah», ٧٠٠ the
 * brown of its hands, and gold is kept for الألف alone — the one thing
 * allowed to borrow the colour this app otherwise reserves for "happening
 * now". Every white number sits on a fill dark enough to read (4.5:1 or
 * better); the two light fills carry a dark number instead.
 */
const TONES: Record<number, Tone> = {
  50: { fill: "#a9d56b", edge: "#5e8f22", ink: "#1f3d0c" },
  100: { fill: "#2f8a2f", edge: "#1f661f", ink: "#ffffff" },
  200: { fill: "#1e6e51", edge: "#12382c", ink: "#ffffff" },
  300: { fill: "#0f7481", edge: "#0a5560", ink: "#ffffff" },
  400: { fill: "#1f5fa8", edge: "#15467f", ink: "#ffffff" },
  500: { fill: "#7a1f3d", edge: "#561429", ink: "#ffffff" },
  600: { fill: "#6d3aa3", edge: "#50297a", ink: "#ffffff" },
  700: { fill: "#8a4f2e", edge: "#65391f", ink: "#ffffff" },
  800: { fill: "#b5501a", edge: "#883b12", ink: "#ffffff" },
  900: { fill: "#8a5a1c", edge: "#664213", ink: "#ffffff" },
};
const GOLD: Tone = { fill: "#e0b04f", edge: "#8a6420", ink: "#3d2a08" };
const LOCKED: Tone = { fill: "none", edge: "#b9c2bd", ink: "#6e7a73" };

const LEAF_GREEN = "#3f9a3a";
const LEAF_LIME = "#8cc63f";

export function badgeTone(milestone: number): Tone {
  return milestone >= 1000 ? GOLD : TONES[milestone] ?? TONES[100];
}

/** 0 plain · 1 from ٢٠٠ · 2 from ٥٠٠ · 3 from الألف. */
function level(milestone: number): 0 | 1 | 2 | 3 {
  if (milestone >= 1000) return 3;
  if (milestone >= 500) return 2;
  if (milestone >= 200) return 1;
  return 0;
}

export type Primitive =
  | {
      kind: "path";
      d: string;
      fill: string;
      opacity?: number;
      stroke?: string;
      strokeWidth?: number;
      dash?: string;
      transform?: string;
    }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number; strokeOpacity?: number; dash?: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; strokeWidth?: number; dash?: string }
  | { kind: "text"; x: number; y: number; size: number; fill: string; text: string };

export type BadgeDrawing = {
  /** The SVG viewBox the primitives are laid out in. */
  viewBox: string;
  /** Width ÷ height, for sizing the drawing. */
  aspect: number;
  parts: Primitive[];
};

const BIG_LEAF = "M32 6 C47 17 51 37 32 60 C13 37 17 17 32 6 Z";
const SMALL_LEAF = "M0 0 C4 -3 5 -8 0 -12 C-5 -8 -4 -3 0 0 Z";

const digits = (n: number) => n.toLocaleString("ar-EG", { useGrouping: false });

// --- أ · الورقة ------------------------------------------------------------

function leaf(milestone: number, locked: boolean): BadgeDrawing {
  const tone = locked ? LOCKED : badgeTone(milestone);
  const parts: Primitive[] = [];

  if (!locked) {
    // Leaves fan out from the stem as the count grows — the logo's crown.
    const fans: [number, number][][] = [
      [],
      [[32, 0.8]],
      [[32, 0.8], [60, 0.64]],
      [[30, 0.82], [58, 0.68], [84, 0.54]],
    ];
    const gold = milestone >= 1000;
    fans[level(milestone)].forEach(([angle, scale], i) => {
      const opacity = (gold ? 0.75 : 0.55) - i * 0.12;
      const fill = gold && i % 2 ? LEAF_LIME : tone.fill;
      for (const a of [-angle, angle]) {
        parts.push({
          kind: "path",
          d: BIG_LEAF,
          fill,
          opacity,
          transform: `translate(32 60) rotate(${a}) scale(${scale}) translate(-32 -60)`,
        });
      }
    });
  }

  parts.push({
    kind: "path",
    d: BIG_LEAF,
    fill: tone.fill,
    stroke: tone.edge,
    strokeWidth: locked ? 1.6 : 1.2,
    dash: locked ? "4 3" : undefined,
  });
  if (!locked) {
    parts.push({ kind: "path", d: "M32 12 L32 57", fill: "none", stroke: tone.ink, strokeWidth: 1.2, opacity: 0.25 });
  }
  parts.push({ kind: "text", x: 32, y: 43, size: milestone >= 1000 ? 12 : 15, fill: tone.ink, text: digits(milestone) });

  // A box that fits the fan, so a lone leaf is not drawn small inside the
  // width the thousand's seven leaves need.
  const boxes: [string, number][] = [
    ["13 3 38 59", 38 / 59],
    ["1 3 62 59", 62 / 59],
    ["-8 2 80 60", 80 / 60],
    ["-20 -4 104 68", 104 / 68],
  ];
  const [viewBox, aspect] = boxes[locked ? 0 : level(milestone)];
  return { viewBox, aspect, parts };
}

// --- ب · التاج -------------------------------------------------------------

function crown(milestone: number, locked: boolean): BadgeDrawing {
  const tone = locked ? LOCKED : badgeTone(milestone);
  const parts: Primitive[] = [];

  if (!locked) {
    const n = milestone >= 1000 ? 11 : milestone >= 500 ? 9 : milestone >= 200 ? 7 : milestone >= 100 ? 5 : 3;
    const step = n > 7 ? 16 : 20;
    for (let i = 0; i < n; i++) {
      const theta = -90 + (i - (n - 1) / 2) * step;
      const r = (theta * Math.PI) / 180;
      const x = 32 + 23 * Math.cos(r);
      const y = 39 + 23 * Math.sin(r);
      const fill = milestone >= 1000 && i % 2 === 0 ? GOLD.fill : i % 2 ? LEAF_LIME : LEAF_GREEN;
      parts.push({
        kind: "path",
        d: SMALL_LEAF,
        fill,
        transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${theta + 90}) scale(1.05)`,
      });
    }
  }

  parts.push({ kind: "circle", cx: 32, cy: 39, r: 19, fill: tone.fill, stroke: tone.edge, strokeWidth: 1.5, dash: locked ? "4 3" : undefined });
  if (!locked) {
    parts.push({ kind: "circle", cx: 32, cy: 39, r: 15, fill: "none", stroke: tone.ink, strokeWidth: 1, strokeOpacity: 0.35 });
  }
  parts.push({ kind: "text", x: 32, y: 44, size: milestone >= 1000 ? 11 : 13, fill: tone.ink, text: digits(milestone) });

  return { viewBox: "0 0 64 64", aspect: 1, parts };
}

// --- ج · من البذرة للشجرة ----------------------------------------------------

function grow(milestone: number, locked: boolean): BadgeDrawing {
  const tone = locked ? LOCKED : badgeTone(milestone);
  const parts: Primitive[] = [
    { kind: "rect", x: 4, y: 2, w: 56, h: 56, rx: 15, fill: tone.fill, stroke: tone.edge, strokeWidth: 1.5, dash: locked ? "4 3" : undefined },
  ];

  if (locked) {
    parts.push({ kind: "text", x: 32, y: 36, size: 13, fill: tone.ink, text: digits(milestone) });
    return { viewBox: "0 0 64 68", aspect: 64 / 68, parts };
  }

  const sprig = (x: number, y: number, r: number, s: number, fill = tone.ink): Primitive => ({
    kind: "path",
    d: SMALL_LEAF,
    fill,
    transform: `translate(${x} ${y}) rotate(${r}) scale(${s})`,
  });
  const fan = (n: number, spread: number, s: number, fills: string[]) =>
    Array.from({ length: n }, (_, i) => sprig(32, 34, -spread / 2 + (spread * i) / (n - 1), s, fills[i % fills.length]));
  const stem = (d: string): Primitive => ({ kind: "path", d, fill: "none", stroke: tone.ink, strokeWidth: 2.4 });

  if (milestone < 100) {
    parts.push({ kind: "path", d: "M32 22.5 A7 9.5 0 1 1 31.99 22.5 Z", fill: tone.ink });
  } else if (milestone < 200) {
    parts.push(stem("M32 44 L32 30"), sprig(32, 32, -55, 1.1), sprig(32, 32, 55, 1.1));
  } else if (milestone < 300) {
    parts.push(stem("M32 44 L32 22"), sprig(32, 38, -58, 1.05), sprig(32, 38, 58, 1.05), sprig(32, 28, -45, 1), sprig(32, 28, 45, 1));
  } else if (milestone < 500) {
    parts.push(stem("M32 44 L32 18"), sprig(32, 38, -58, 1.05), sprig(32, 38, 58, 1.05), sprig(32, 29, -45, 1), sprig(32, 29, 45, 1), sprig(32, 19, 0, 1));
  } else if (milestone < 1000) {
    parts.push(stem("M32 45 L32 32 M32 38 L27 34 M32 36 L37 32"), ...fan(7, 150, 1.45, [tone.ink]));
  } else {
    parts.push(stem("M32 46 L32 33 M32 40 L26 35 M32 38 L38 33 M24 46 L40 46"), ...fan(11, 170, 1.7, ["#1f661f", LEAF_GREEN, "#ffffff"]));
  }

  parts.push(
    { kind: "rect", x: 13, y: 50, w: 38, h: 16, rx: 8, fill: "#ffffff", stroke: tone.edge, strokeWidth: 1.5 },
    { kind: "text", x: 32, y: 62, size: milestone >= 1000 ? 10 : 11, fill: tone.edge, text: digits(milestone) },
  );
  return { viewBox: "0 0 64 68", aspect: 64 / 68, parts };
}

const DRAW: Record<BadgeShape, (m: number, locked: boolean) => BadgeDrawing> = { leaf, crown, grow };

export function drawBadge(
  milestone: number,
  { locked = false, shape = BADGE_SHAPE }: { locked?: boolean; shape?: BadgeShape } = {},
): BadgeDrawing {
  return DRAW[shape](milestone, locked);
}

/** The same drawing as a standalone SVG document — for the share image. */
export function badgeSvgMarkup(milestone: number, fontFamily: string, locked = false): string {
  const { viewBox, parts } = drawBadge(milestone, { locked });
  const attr = (name: string, value: string | number | undefined) =>
    value === undefined ? "" : ` ${name}="${value}"`;
  const body = parts
    .map((p) => {
      switch (p.kind) {
        case "path":
          return `<path d="${p.d}" fill="${p.fill}"${attr("fill-opacity", p.opacity)}${attr("stroke", p.stroke)}${attr("stroke-width", p.strokeWidth)}${attr("stroke-dasharray", p.dash)}${attr("transform", p.transform)}${p.stroke && p.fill === "none" ? attr("stroke-opacity", p.opacity) : ""}/>`;
        case "circle":
          return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}"${attr("stroke", p.stroke)}${attr("stroke-width", p.strokeWidth)}${attr("stroke-opacity", p.strokeOpacity)}${attr("stroke-dasharray", p.dash)}/>`;
        case "rect":
          return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" fill="${p.fill}"${attr("stroke", p.stroke)}${attr("stroke-width", p.strokeWidth)}${attr("stroke-dasharray", p.dash)}/>`;
        case "text":
          return `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="${p.size}" font-weight="700" fill="${p.fill}" font-family="${fontFamily}">${p.text}</text>`;
      }
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}
