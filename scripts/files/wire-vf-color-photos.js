#!/usr/bin/env node
/**
 * Read images/rooms-recolored/manifest.json and rewrite the
 * `vf-color-photos` JSON block inside sections/kmeconsulting-product-finder.liquid
 * so the configurator's hover preview pulls in the uploaded room photos.
 *
 * Output format is an ARRAY of URLs per color, in a deterministic order
 * (rooms sorted alphabetically). The configurator JS cycles through the
 * array on hover so the customer sees the same color in several different
 * scenes — much more inspiring than always the same living room.
 *
 *     "DLM0101": [
 *       "https://cdn.shopify.com/.../dlm-room-badevaerelse-DLM0101.jpg",
 *       "https://cdn.shopify.com/.../dlm-room-entre-DLM0101.jpg",
 *       ...5 entries, one per room
 *     ]
 *
 * The script is conservative — it only rewrites the JSON contents between
 * the `<script id="vf-color-photos" ...>` opening tag and its `</script>`
 * closing tag. Everything else in the Liquid file is preserved exactly,
 * including comments and whitespace outside the JSON block.
 *
 * Usage:
 *   node scripts/files/wire-vf-color-photos.js                # all rooms, all colors
 *   node scripts/files/wire-vf-color-photos.js --rooms stue,sovevaerelse
 *   node scripts/files/wire-vf-color-photos.js --variation full
 *   node scripts/files/wire-vf-color-photos.js --dry-run      # print, don't write
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const MANIFEST_PATH = resolve(REPO_ROOT, "images/rooms-recolored/manifest.json");
const SECTION_PATH = resolve(REPO_ROOT, "sections/kmeconsulting-product-finder.liquid");

const DRY_RUN = process.argv.includes("--dry-run");
// Comma-separated list of rooms; defaults to all available in the manifest.
const ROOMS_ARG = readArg("--rooms");
const variation = readArg("--variation") || "full";

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── Load manifest + section ─────────────────────────────────────────

if (!existsSync(MANIFEST_PATH)) {
  console.error(`No manifest at ${MANIFEST_PATH}. Run upload-recolored-rooms.js first.`);
  process.exit(1);
}
if (!existsSync(SECTION_PATH)) {
  console.error(`Section not found: ${SECTION_PATH}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

// Pick which rooms to include. Default: every room in the manifest that
// has at least one image for the requested variation. The configurator
// JS will cycle through the rooms on hover, so order matters — we sort
// alphabetically for deterministic output.
const availableRooms = Object.keys(manifest)
  .filter((r) => manifest[r]?.[variation] && Object.keys(manifest[r][variation]).length > 0)
  .sort();

const requestedRooms = ROOMS_ARG
  ? ROOMS_ARG.split(",").map((s) => s.trim()).filter(Boolean)
  : availableRooms;

const rooms = requestedRooms.filter((r) => {
  if (availableRooms.includes(r)) return true;
  console.warn(`  skipping room "${r}" — not in manifest`);
  return false;
});

if (rooms.length === 0) {
  console.error(`No rooms to wire. Available: ${availableRooms.join(", ") || "(none)"}.`);
  process.exit(1);
}

// Collect the union of every DLM code that has at least one room photo.
// A color is included even if some rooms don't have it (configurator
// just gets a shorter array for that color).
const codeSet = new Set();
for (const room of rooms) {
  for (const code of Object.keys(manifest[room][variation])) codeSet.add(code);
}
const codes = [...codeSet].sort();

console.log(`Wiring ${codes.length} colors × ${rooms.length} rooms = ` +
  `${codes.reduce((n, c) => n + rooms.filter((r) => manifest[r][variation][c]).length, 0)} URLs ` +
  `from manifest[*][${variation}] (rooms: ${rooms.join(", ")}) ...`);

// Build DLM_ID -> [url1, url2, ...] entries. Pretty-print with one URL
// per line so diffs are readable.
const lines = codes.map((code, idx) => {
  const urls = rooms
    .map((room) => manifest[room][variation][code])
    .filter(Boolean);
  const trailing = idx === codes.length - 1 ? "" : ",";
  const urlLines = urls.map((u, ui) =>
    `    ${JSON.stringify(u)}${ui === urls.length - 1 ? "" : ","}`).join("\n");
  return `  ${JSON.stringify(code)}: [\n${urlLines}\n  ]${trailing}`;
});
const jsonBody = `{\n${lines.join("\n")}\n}`;

// ── Rewrite the section ─────────────────────────────────────────────

const original = readFileSync(SECTION_PATH, "utf-8");

// Match the script tag and replace ONLY its inner JSON body.
const tagRe = /(<script id="vf-color-photos"[^>]*>)([\s\S]*?)(<\/script>)/;
const match = original.match(tagRe);
if (!match) {
  console.error(`Could not find <script id="vf-color-photos"> tag in section file.`);
  process.exit(1);
}

const updated = original.replace(tagRe, `$1\n${jsonBody}\n$3`);

if (DRY_RUN) {
  console.log("\n── New <script id=\"vf-color-photos\"> body (dry run) ──");
  console.log(jsonBody.slice(0, 600) + (jsonBody.length > 600 ? "\n  ...\n}" : ""));
  console.log(`\n(${codes.length} entries; would write ${updated.length - original.length >= 0 ? "+" : ""}${updated.length - original.length} bytes to section)`);
  process.exit(0);
}

writeFileSync(SECTION_PATH, updated);
console.log(`Wrote ${codes.length} entries to ${SECTION_PATH.replace(REPO_ROOT + "/", "")}.`);
console.log(`Next: ./shopify.sh push`);
