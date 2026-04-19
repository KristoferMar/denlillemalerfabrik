#!/usr/bin/env node
/**
 * Removes the Gemini / Nano Banana sparkle watermark from the bottom-right
 * corner of AI-generated product images. Clones a clean rectangular region
 * from directly above the watermark and composites it on top, preserving
 * the background gradient and photographic noise. Edges are feathered so
 * the patch blends seamlessly.
 *
 * Works on any image size (percentage-based regions).
 *
 * Input : a file or a directory (processes all .png/.jpg in the dir).
 * Output: writes to a sibling "Cleaned/" folder next to the input.
 *
 * Usage:
 *   node scripts/images/remove-watermark.js path/to/image.png
 *   node scripts/images/remove-watermark.js path/to/dir/
 *   node scripts/images/remove-watermark.js path/to/image.png --dry-run
 *
 *   # Tuning knobs:
 *   --wm-size 0.08   watermark region as % of image width/height (default 0.085)
 *   --wm-pad  0.015  distance from bottom/right edge as % (default 0.015)
 *   --feather 0.15   blur radius relative to patch size for edge feathering
 */

import sharp from "sharp";
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, basename, dirname, extname } from "node:path";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

function numFlag(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = parseFloat(argv[i + 1]);
  return isNaN(v) ? fallback : v;
}

const WM_SIZE = numFlag("--wm-size", 0.085);
const WM_PAD = numFlag("--wm-pad", 0.015);
const FEATHER = numFlag("--feather", 0.15);

const inputs = argv.filter((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a));
if (inputs.length === 0) {
  console.error("Usage: remove-watermark.js <file-or-dir>... [--dry-run]");
  process.exit(1);
}

async function processImage(inputPath) {
  const meta = await sharp(inputPath).metadata();
  const { width, height } = meta;

  const wmW = Math.round(width * WM_SIZE);
  const wmH = Math.round(height * WM_SIZE);
  const wmX = width - Math.round(width * WM_PAD) - wmW;
  const wmY = height - Math.round(height * WM_PAD) - wmH;

  // Clone source: a rectangle directly above the watermark (same x-range,
  // shifted up by watermark height + a small gap to avoid picking up any
  // sparkle glow). Preserves gradient, noise, texture.
  const gap = Math.round(wmH * 0.15);
  const srcX = wmX;
  const srcY = Math.max(0, wmY - wmH - gap);
  const srcW = wmW;
  const srcH = wmH;

  console.log(`${basename(inputPath)}`);
  console.log(`  size: ${width}×${height}`);
  console.log(`  wm:   x=${wmX}, y=${wmY}, ${wmW}×${wmH}`);
  console.log(`  src:  x=${srcX}, y=${srcY}, ${srcW}×${srcH} (cloned from above)`);

  if (DRY_RUN) {
    console.log(`  (dry-run — not written)`);
    return;
  }

  // Extract the clone region as raw RGB
  const patch = await sharp(inputPath)
    .extract({ left: srcX, top: srcY, width: srcW, height: srcH })
    .png()
    .toBuffer();

  // Build a soft-edge alpha mask so the patch blends at its borders.
  // Mask is a white-filled rect with a blurred border.
  const featherPx = Math.max(1, Math.round(Math.min(wmW, wmH) * FEATHER));
  const innerW = wmW - featherPx * 2;
  const innerH = wmH - featherPx * 2;
  // Build mask: fully black canvas, white rectangle in the middle, blur the whole thing.
  const maskSvg = `<svg width="${wmW}" height="${wmH}">
    <rect width="${wmW}" height="${wmH}" fill="black"/>
    <rect x="${featherPx}" y="${featherPx}" width="${innerW}" height="${innerH}" fill="white"/>
  </svg>`;
  const mask = await sharp(Buffer.from(maskSvg))
    .blur(featherPx)
    .extractChannel("red")
    .toBuffer();

  // Apply the soft mask as the alpha channel of the patch.
  const softPatch = await sharp(patch)
    .joinChannel(mask)
    .png()
    .toBuffer();

  const cleanedDir = join(dirname(inputPath), "..", "Cleaned");
  if (!existsSync(cleanedDir)) mkdirSync(cleanedDir, { recursive: true });
  const outputPath = join(cleanedDir, basename(inputPath));

  await sharp(inputPath)
    .composite([{ input: softPatch, top: wmY, left: wmX }])
    .toFile(outputPath);

  console.log(`  → ${outputPath}`);
}

function collect(p) {
  const abs = resolve(p);
  const s = statSync(abs);
  if (s.isDirectory()) {
    return readdirSync(abs)
      .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
      .map((f) => join(abs, f));
  }
  return [abs];
}

for (const arg of inputs) {
  for (const f of collect(arg)) {
    await processImage(f);
  }
}
