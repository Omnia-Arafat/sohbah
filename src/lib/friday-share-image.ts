import { badgeSvgMarkup, drawBadge } from "@/lib/friday-badges";

/**
 * The picture that goes to the WhatsApp group, drawn on a canvas.
 *
 * It has to read at thumbnail size in a chat, so it carries four things and
 * nothing else: whose Friday, the badge, the count, and الكهف. The badge is
 * the same drawing the app shows (`friday-badges.ts`), rendered through an
 * SVG image so the two can never drift apart.
 */

export type ShareImageInput = {
  name: string;
  count: number;
  /** The highest badge earned, or 0 for none yet. */
  milestone: number;
  kahfPages: number;
  labels: {
    academy: string;
    myWeek: string;
    salawat: string;
    kahf: string | null;
    closing: string;
    date: string;
  };
  digits: (n: number) => string;
};

const W = 1080;
const H = 1500;

/** The families next/font actually registered, read off the live page. */
function pageFonts(): { sans: string; display: string } {
  const probe = document.createElement("span");
  probe.className = "font-display";
  document.body.appendChild(probe);
  const display = getComputedStyle(probe).fontFamily;
  probe.remove();
  return { sans: getComputedStyle(document.body).fontFamily, display };
}

function loadSvg(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

export async function renderShareImage(input: ShareImageInput): Promise<HTMLCanvasElement> {
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

  // Ground and frame.
  ctx.fillStyle = "#edf2ef";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fbfdfc";
  ctx.strokeStyle = "#cfe0d8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(40, 40, W - 80, H - 80, 64);
  ctx.fill();
  ctx.stroke();

  // Top line: the academy, and whose week this is.
  ctx.font = `700 40px ${sans}`;
  ctx.fillStyle = "#1a5842";
  ctx.textAlign = "right";
  ctx.fillText(input.labels.academy, W - 110, 140);
  ctx.textAlign = "left";
  ctx.fillStyle = "#5a6e66";
  ctx.font = `600 40px ${sans}`;
  ctx.fillText(input.labels.myWeek, 110, 140);
  ctx.textAlign = "center";

  // The badge — the earned one, or the first still to come.
  const milestone = input.milestone || 50;
  const drawing = drawBadge(milestone, { locked: !input.milestone });
  const badgeH = 330;
  const badgeW = badgeH * drawing.aspect;
  const img = await loadSvg(badgeSvgMarkup(milestone, "Cairo, sans-serif", !input.milestone));
  ctx.drawImage(img, (W - badgeW) / 2, 200, badgeW, badgeH);

  // Name.
  ctx.fillStyle = "#0e1f19";
  ctx.font = `700 88px ${display}`;
  ctx.fillText(input.name, W / 2, 680, W - 200);

  // The count.
  ctx.fillStyle = "#1a5842";
  ctx.font = `700 200px ${display}`;
  ctx.fillText(input.digits(input.count), W / 2, 900);
  ctx.fillStyle = "#0e1f19";
  ctx.font = `700 50px ${sans}`;
  ctx.fillText(input.labels.salawat, W / 2, 980);

  // الكهف.
  if (input.labels.kahf) {
    ctx.font = `700 46px ${sans}`;
    const text = input.labels.kahf;
    const width = ctx.measureText(text).width + 100;
    ctx.fillStyle = "#edf7f2";
    ctx.beginPath();
    ctx.roundRect((W - width) / 2, 1040, width, 96, 48);
    ctx.fill();
    ctx.fillStyle = "#1a5842";
    ctx.fillText(text, W / 2, 1104);
  }

  // Closing line and date.
  ctx.fillStyle = "#1a5842";
  ctx.font = `400 50px ${display}`;
  ctx.fillText(input.labels.closing, W / 2, 1320);
  ctx.fillStyle = "#5a6e66";
  ctx.font = `400 36px ${sans}`;
  ctx.fillText(input.labels.date, W / 2, 1390);

  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}
