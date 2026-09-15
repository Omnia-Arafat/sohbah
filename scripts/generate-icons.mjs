/**
 * Builds the app icons from the academy's own logo.
 *
 * The icons shipped until now were Itqan's eight-pointed mark, rendered from
 * `public/brand/mark.svg` when this was a single-academy app. Installing
 * صحبة put إتقان's logo on the home screen.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, neither of them obvious:
 *
 *   The source has a stray copy of the mark in its top-left corner, about
 *   96×96, separate from the lockup. Scaled into an icon it reads as a smudge
 *   in the corner, so it is erased before anything else — and because it
 *   touches the edge, a plain trim() would keep the whole canvas and find
 *   nothing to cut.
 *
 *   `maskable` is not the same image as `any`. Android crops a maskable icon
 *   to whatever shape the launcher uses — a circle on most — and keeps only
 *   the middle 80%. The manifest pointed both purposes at one file, so the
 *   round icon would have had its edges cut off. They are separate files now,
 *   and the maskable one is drawn smaller inside its safe area.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE = "public/assets/logos/sohbah-logo.webp";

/** The logo is dark green and maroon on nothing; it needs a light ground. */
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/** The stray mark, measured off the alpha channel. */
const STRAY = { left: 0, top: 0, width: 104, height: 118 };

/**
 * `any` gets a small margin — launchers that do not crop show the whole tile,
 * and the lockup should not touch the edge. `maskable` gets the 20% the spec
 * reserves, so a circular crop takes only background.
 */
const TARGETS = [
  { out: "public/icon-192.png", size: 192, inset: 0.08 },
  { out: "public/icon-512.png", size: 512, inset: 0.08 },
  { out: "public/icon-maskable-512.png", size: 512, inset: 0.22 },
  // iOS never crops to a circle; it rounds the corners, so the margin only has
  // to clear the radius.
  { out: "src/app/apple-icon.png", size: 180, inset: 0.1 },
];

const logo = await sharp(SOURCE)
  .ensureAlpha()
  .composite([
    {
      // A rectangle knocked out of the alpha channel: `dest-out` keeps the
      // destination except where this overlay is opaque.
      input: {
        create: {
          width: STRAY.width,
          height: STRAY.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      },
      left: STRAY.left,
      top: STRAY.top,
      blend: "dest-out",
    },
  ])
  .png()
  .toBuffer();

// Now that the corner is clear, trim() finds the lockup itself.
const trimmed = await sharp(logo).trim({ threshold: 12 }).png().toBuffer();
const { width, height } = await sharp(trimmed).metadata();
console.log(`lockup after trim: ${width}x${height}`);

/** The lockup, centred on the ground, at one size. */
async function tile(size, inset) {
  const box = Math.round(size * (1 - inset * 2));
  const scaled = await sharp(trimmed)
    .resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: scaled, gravity: "center" }])
    .png()
    .toBuffer();
}

for (const { out, size, inset } of TARGETS) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await tile(size, inset));
  console.log(`  ${out.padEnd(34)} ${size}x${size}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}

/*
 * The browser tab.
 *
 * `src/app/icon.svg` was Itqan's mark — its own <title> said so — and a
 * favicon.ico sat beside it. Both are replaced rather than edited: the SVG is
 * a hand-drawn octagram with nothing of this academy in it.
 *
 * favicon.ico is still written, and by hand, because sharp has no ICO encoder
 * and the format needs none: since Vista an .ico may hold PNGs verbatim, so
 * the file is a 6-byte header, one 16-byte directory entry per size, and the
 * PNGs themselves. It stays because browsers still request /favicon.ico
 * directly, without reading the page.
 */
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map((s) => tile(s, 0.04)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(icoSizes.length, 4);

let offset = 6 + 16 * icoSizes.length;
const entries = icoSizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette colours — none, this is truecolour
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(icoImages[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += icoImages[i].length;
  return entry;
});

fs.writeFileSync(
  "src/app/favicon.ico",
  Buffer.concat([header, ...entries, ...icoImages]),
);
console.log(
  `  ${"src/app/favicon.ico".padEnd(34)} ${icoSizes.join("/")}  ${(fs.statSync("src/app/favicon.ico").size / 1024).toFixed(1)} KB`,
);

fs.rmSync("src/app/icon.svg", { force: true });
console.log("  src/app/icon.svg                   removed (was Itqan's mark)");
