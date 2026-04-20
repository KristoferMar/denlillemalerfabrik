#!/usr/bin/env node
/**
 * Color drift audit — compares the same 32 paint colors across THREE sources:
 *
 *   A. Paint Color metaobjects (shop.metaobjects.paint_color)
 *   B. Product variant option swatches (Farve option on 6 canonical paint products)
 *   C. docs/colors.md
 *
 * Reports any mismatch in name, code, or hex value. Normalises hex casing and
 * shorthand (#abc → #AABBCC) before comparing so we don't flag cosmetic diffs.
 *
 * Usage: node scripts/products/audit-color-drift.js
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const COLORS_MD_PATH = resolve(REPO_ROOT, "docs", "colors.md");

const PAINT_HANDLES = [
  "vaegmaling-glans-10",
  "loftmaling-glans-5",
  "trae-metal-glans-30",
  "strukturmaling-glans-5",
  "traebeskyttelse-glans-20",
  "gulvmaling-glans-40",
];

// ─── Hex helpers ────────────────────────────────────────────────────

function normaliseHex(raw) {
  if (!raw) return null;
  let h = String(raw).trim().toUpperCase();
  if (!h.startsWith("#")) h = "#" + h;
  const m3 = h.match(/^#([0-9A-F])([0-9A-F])([0-9A-F])$/);
  if (m3) h = "#" + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3];
  return /^#[0-9A-F]{6}$/.test(h) ? h : null;
}

// ─── Source A: metaobjects ──────────────────────────────────────────

const METAOBJECT_QUERY = `
  query($cursor: String) {
    metaobjects(type: "paint_color", first: 100, after: $cursor) {
      nodes {
        handle
        name:  field(key: "name")        { value }
        code:  field(key: "dlm_code")    { value }
        hex:   field(key: "hex_color")   { value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function loadMetaobjects() {
  const out = [];
  let cursor = null;
  do {
    const data = await shopifyGraphQL(METAOBJECT_QUERY, { cursor });
    for (const node of data.metaobjects.nodes) {
      out.push({
        handle: node.handle,
        name: node.name?.value ?? null,
        code: node.code?.value ?? null,
        hex: normaliseHex(node.hex?.value),
      });
    }
    cursor = data.metaobjects.pageInfo.hasNextPage ? data.metaobjects.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

// ─── Source B: product variant option swatches ──────────────────────

const PRODUCT_OPTIONS_QUERY = `
  query($handle: String!) {
    productByHandle(handle: $handle) {
      handle
      title
      options {
        name
        optionValues { name swatch { color } }
      }
    }
  }
`;

async function loadProductSwatches() {
  const perProduct = {};
  for (const handle of PAINT_HANDLES) {
    const data = await shopifyGraphQL(PRODUCT_OPTIONS_QUERY, { handle });
    const product = data.productByHandle;
    if (!product) {
      perProduct[handle] = { missing: true };
      continue;
    }
    const farveOption = product.options.find((o) => o.name === "Farve");
    if (!farveOption) {
      perProduct[handle] = { missing: true, reason: "no Farve option" };
      continue;
    }
    // Track color presence AND swatch presence separately. A color can be
    // present as an option value (name) but have no visual swatch hex set.
    const names = new Set();
    const swatches = {};
    for (const v of farveOption.optionValues || []) {
      names.add(v.name);
      if (v.swatch?.color) swatches[v.name] = normaliseHex(v.swatch.color);
    }
    perProduct[handle] = { names, swatches };
  }
  return perProduct;
}

// ─── Source C: docs/colors.md ───────────────────────────────────────

function loadColorsMd() {
  const md = readFileSync(COLORS_MD_PATH, "utf-8");
  const rows = [];
  for (const line of md.split("\n")) {
    // Match table rows: | DLM0101 | Snehvid | #FAFAFA |
    const m = line.match(/^\s*\|\s*(DLM\d{4})\s*\|\s*([^|]+?)\s*\|\s*(#[0-9A-Fa-f]{3,6})\s*\|/);
    if (m) rows.push({ code: m[1], name: m[2].trim(), hex: normaliseHex(m[3]) });
  }
  return rows;
}

// ─── Main ───────────────────────────────────────────────────────────

console.log("Loading sources…\n");
const [metaobjects, productSwatches] = await Promise.all([
  loadMetaobjects(),
  loadProductSwatches(),
]);
const mdColors = loadColorsMd();

console.log(`  A. Metaobjects       : ${metaobjects.length} entries`);
console.log(`  B. Product swatches  : ${Object.keys(productSwatches).length} products`);
console.log(`  C. docs/colors.md    : ${mdColors.length} entries\n`);

// Build canonical set indexed by name.
const mdByName = new Map(mdColors.map((c) => [c.name, c]));
const metaByName = new Map(metaobjects.map((c) => [c.name, c]));

// ─── Report 1: A vs C (metaobject ↔ docs/colors.md hex parity) ─────

console.log(`── A vs C: metaobject ↔ docs/colors.md (32 canonical colors) ──\n`);

const allCanonicalNames = new Set([...mdByName.keys(), ...metaByName.keys()]);
const sortedCanonical = [...allCanonicalNames].sort((a, b) => {
  const ca = mdByName.get(a)?.code ?? metaByName.get(a)?.code ?? "ZZZZ";
  const cb = mdByName.get(b)?.code ?? metaByName.get(b)?.code ?? "ZZZZ";
  return ca.localeCompare(cb);
});

let driftACount = 0;
let onlyMdCount = 0;
let onlyMetaCount = 0;
for (const name of sortedCanonical) {
  const md = mdByName.get(name);
  const meta = metaByName.get(name);
  if (!md) { onlyMetaCount++; console.log(`  🟡 ${name.padEnd(14)} only in metaobject (${meta.hex})`); continue; }
  if (!meta) { onlyMdCount++; console.log(`  🟡 ${name.padEnd(14)} only in docs/colors.md (${md.hex})`); continue; }
  if (md.hex !== meta.hex) {
    driftACount++;
    console.log(`  🔴 ${name.padEnd(14)} docs: ${md.hex}   meta: ${meta.hex}`);
  }
  if (md.code && meta.code && md.code !== meta.code) {
    console.log(`  🔴 ${name.padEnd(14)} code drift — docs: ${md.code}  meta: ${meta.code}`);
  }
}
if (driftACount === 0 && onlyMdCount === 0 && onlyMetaCount === 0) {
  console.log(`  ✓ All ${mdColors.length} colors match in name, code and hex.\n`);
} else {
  console.log();
}

// ─── Report 2: B (product variant option coverage) ────────────────

console.log(`── B: product variant options (name + swatch presence) ──\n`);
const canonicalNameSet = new Set(sortedCanonical);

let anyNameIssue = false;
let anySwatchIssue = false;
for (const handle of PAINT_HANDLES) {
  const p = productSwatches[handle];
  if (p?.missing) {
    console.log(`  🔴 ${handle.padEnd(30)} ${p.reason || "product missing"}`);
    continue;
  }
  const namesArr = [...p.names];
  const missingNames = [...canonicalNameSet].filter((n) => !p.names.has(n));
  const extraNames = namesArr.filter((n) => !canonicalNameSet.has(n));
  const swatchesSet = Object.keys(p.swatches).length;

  const namesOk = missingNames.length === 0 && extraNames.length === 0;
  const tag = namesOk ? "🟢" : "🔴";
  console.log(`  ${tag} ${handle.padEnd(30)} ${p.names.size}/${canonicalNameSet.size} colors as option values, ${swatchesSet}/${p.names.size} with swatch hex set`);
  if (missingNames.length) { anyNameIssue = true; console.log(`     missing: ${missingNames.join(", ")}`); }
  if (extraNames.length)   { anyNameIssue = true; console.log(`     extra  : ${extraNames.join(", ")}`); }
  if (swatchesSet < p.names.size) anySwatchIssue = true;
}
console.log();

// If swatches are set, check hex drift vs metaobjects
const hexDriftRows = [];
for (const handle of PAINT_HANDLES) {
  const p = productSwatches[handle];
  if (!p?.swatches) continue;
  for (const [name, productHex] of Object.entries(p.swatches)) {
    const metaHex = metaByName.get(name)?.hex;
    if (metaHex && productHex !== metaHex) {
      hexDriftRows.push({ handle, name, productHex, metaHex });
    }
  }
}
if (hexDriftRows.length > 0) {
  console.log(`── B vs A: product swatch hex drift ──\n`);
  for (const row of hexDriftRows) {
    console.log(`  🔴 ${row.handle} / ${row.name}:  product ${row.productHex}   meta ${row.metaHex}`);
  }
  console.log();
}

// ─── Summary ──────────────────────────────────────────────────────

console.log(`── Summary ──`);
console.log(`  A (metaobjects)     : ${metaobjects.length} colors`);
console.log(`  C (docs/colors.md)  : ${mdColors.length} colors`);
console.log(`  A ↔ C hex drift     : ${driftACount}`);
console.log(`  A ↔ C name mismatch : ${onlyMdCount + onlyMetaCount}`);
console.log(`  B coverage          : ${anyNameIssue ? "⚠ names missing on some products" : "✓ all 6 products carry all 32 names"}`);
console.log(`  B swatch hex        : ${anySwatchIssue ? "⚠ swatch hex NOT set on variant option values (PDP picker relies on text pills)" : "✓ every variant option has a swatch hex"}`);
console.log(`  B ↔ A swatch drift  : ${hexDriftRows.length}`);

const critical = driftACount + onlyMdCount + onlyMetaCount + (anyNameIssue ? 1 : 0) + hexDriftRows.length;
process.exit(critical > 0 ? 1 : 0);
