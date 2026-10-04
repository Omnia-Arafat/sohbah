import { pageFonts } from "@/lib/friday-share-image";

/**
 * بطاقة تتميم الورد as a picture, drawn on a canvas — what she sends to her
 * group instead of the plain text it used to be.
 *
 * Deep green with a gold frame and an arch, because it is a card she is glad
 * to send, not a screen of the app: the rule that keeps gold for "happening
 * now" is about the app's own screens. It carries what the text did — the day,
 * her name and her رفيقة's, what she completed — plus where it belongs: the
 * track, the دفعة, the week and the معلمة, and the date and time.
 */

export type TrackCardInput = {
  academy: string;
  heading: string;
  day: string;
  /** Already formatted: "٦ أكتوبر ٢٠٢٦ · ٢٥ ربيع الآخر ١٤٤٨ هـ · ٩:٤٥ م". */
  when: string;
  track: string;
  chips: { text: string; tone: "green" | "gold" }[];
  student: { label: string; name: string };
  partner: { label: string; name: string } | null;
  items: string[];
  closing: string;
};

const W = 1080;
const H = 1350;

const GROUND = "#12382c";
const GOLD = "#d6ab53";
const PANEL = "#fbf6ea";
const INK = "#12382c";
const MUTED = "#5a6e66";

/** Shrinks a font until the text fits, so a long name never runs off the card. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let current = size;
  ctx.font = `${weight} ${current}px ${family}`;
  while (ctx.measureText(text).width > max && current > 18) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${family}`;
  }
}

function drawCheck(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, colour: string, width: number) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.12, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.42, cy - size * 0.3);
  ctx.stroke();
  ctx.restore();
}

export async function renderTrackCard(input: TrackCardInput): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const { sans, display } = pageFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Ground and the double frame.
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(28, 28, W - 56, H - 56, 28);
  ctx.stroke();
  ctx.strokeStyle = "rgba(214,171,83,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(40, 40, W - 80, H - 80, 20);
  ctx.stroke();

  // The academy, between two short rules.
  ctx.fillStyle = GOLD;
  fit(ctx, input.academy, 700, 34, display, 620);
  ctx.fillText(input.academy, W / 2, 108);
  const academyWidth = ctx.measureText(input.academy).width;
  ctx.fillRect(W / 2 + academyWidth / 2 + 18, 96, 64, 1.5);
  ctx.fillRect(W / 2 - academyWidth / 2 - 82, 96, 64, 1.5);

  // The arch.
  const left = 100;
  const right = W - 100;
  const top = 150;
  const bottom = H - 150;
  const radius = (right - left) / 2;
  ctx.beginPath();
  ctx.moveTo(left, top + radius);
  ctx.arc(W / 2, top + radius, radius, Math.PI, 0);
  ctx.lineTo(right, bottom - 36);
  ctx.arcTo(right, bottom, right - 36, bottom, 36);
  ctx.lineTo(left + 36, bottom);
  ctx.arcTo(left, bottom, left, bottom - 36, 36);
  ctx.closePath();
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();

  // The seal.
  ctx.beginPath();
  ctx.arc(W / 2, 262, 48, 0, Math.PI * 2);
  ctx.fillStyle = "#f7edd6";
  ctx.fill();
  ctx.strokeStyle = "#c4913a";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawCheck(ctx, W / 2, 262, 56, "#1e6e51", 7);

  // Heading, day, date and time.
  ctx.fillStyle = INK;
  fit(ctx, input.heading, 700, 68, display, 700);
  ctx.fillText(input.heading, W / 2, 384);
  ctx.fillStyle = "#7e5a24";
  fit(ctx, input.day, 700, 36, sans, 700);
  ctx.fillText(input.day, W / 2, 462);
  ctx.fillStyle = MUTED;
  fit(ctx, input.when, 400, 25, sans, 760);
  ctx.fillText(input.when, W / 2, 510);

  // The track and its chips.
  ctx.fillStyle = "#1e6e51";
  fit(ctx, input.track, 700, 44, display, 720);
  ctx.fillText(input.track, W / 2, 572);

  let chipSize = 26;
  const chipWidths = () => {
    ctx.font = `700 ${chipSize}px ${sans}`;
    return input.chips.map((chip) => ctx.measureText(chip.text).width + 44);
  };
  let widths = chipWidths();
  const total = () => widths.reduce((sum, width) => sum + width, 0) + 12 * (widths.length - 1);
  while (total() > 760 && chipSize > 18) {
    chipSize -= 2;
    widths = chipWidths();
  }
  // Right to left: the first chip sits at the right edge of the row.
  let x = W / 2 + total() / 2;
  input.chips.forEach((chip, index) => {
    const width = widths[index];
    const gold = chip.tone === "gold";
    ctx.beginPath();
    ctx.roundRect(x - width, 604, width, 46, 23);
    ctx.fillStyle = gold ? "#fbf6ea" : "#edf7f2";
    ctx.fill();
    ctx.strokeStyle = gold ? "#e3c37c" : "#a8d9c2";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = gold ? "#7e5a24" : "#1a5842";
    ctx.font = `700 ${chipSize}px ${sans}`;
    ctx.fillText(chip.text, x - width / 2, 636);
    x -= width + 12;
  });

  // The rule with its diamond.
  ctx.fillStyle = "#e3c37c";
  ctx.fillRect(W / 2 - 260, 689, 236, 1.5);
  ctx.fillRect(W / 2 + 24, 689, 236, 1.5);
  ctx.save();
  ctx.translate(W / 2, 690);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#c4913a";
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();

  // Her name and her رفيقة's.
  const people = input.partner ? [input.student, input.partner] : [input.student];
  const inner = right - left - 128;
  const boxWidth = people.length === 2 ? (inner - 16) / 2 : inner;
  people.forEach((person, index) => {
    const boxRight = right - 64 - index * (boxWidth + 16);
    ctx.beginPath();
    ctx.roundRect(boxRight - boxWidth, 722, boxWidth, 108, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#dbe5e0";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = `400 24px ${sans}`;
    ctx.fillText(person.label, boxRight - boxWidth / 2, 760);
    ctx.fillStyle = INK;
    fit(ctx, person.name, 700, 38, display, boxWidth - 32);
    ctx.fillText(person.name, boxRight - boxWidth / 2, 810);
  });

  // What she completed.
  ctx.textAlign = "right";
  input.items.forEach((item, index) => {
    const y = 892 + index * 62;
    const circleX = right - 64 - 19;
    ctx.beginPath();
    ctx.arc(circleX, y, 19, 0, Math.PI * 2);
    ctx.fillStyle = "#1e6e51";
    ctx.fill();
    drawCheck(ctx, circleX, y, 22, "#ffffff", 4);
    ctx.fillStyle = INK;
    fit(ctx, item, 600, 29, sans, inner - 60);
    ctx.fillText(item, circleX - 34, y + 10);
  });
  ctx.textAlign = "center";

  // The closing line, under the arch.
  ctx.fillStyle = GOLD;
  fit(ctx, input.closing, 700, 56, display, 800);
  ctx.fillText(input.closing, W / 2, H - 78);

  return canvas;
}
