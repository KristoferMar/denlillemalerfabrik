#!/usr/bin/env node
/**
 * Applies the agreed mapping of broken handles → real product handles to
 * `snippets/beregner-config.liquid`.
 *
 * Two TODO slots (tapetklister, metalprimer) are deliberately left alone —
 * those products don't exist in the catalog yet. The audit will keep flagging
 * them until the customer either creates the products or removes the slots.
 *
 * Usage:
 *   node scripts/products/apply-beregner-handle-mapping.js --dry-run
 *   node scripts/products/apply-beregner-handle-mapping.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(REPO_ROOT, "snippets", "beregner-config.liquid");

const DRY_RUN = process.argv.includes("--dry-run");

// broken handle → real catalog handle
const MAPPINGS = {
  // Outdated paint references
  "interior-glans-5":          "vaegmaling-glans-10",
  "loft-glans-25":             "loftmaling-glans-5",
  "trae-glans-40":             "trae-metal-glans-40",

  // Paint placeholders
  "TODO-gulvmaling":           "gulvmaling-glans-40",
  "TODO-industrigulvmaling":   "gulvmaling-glans-60",
  "TODO-facademaling":         "mur-facademaling-akryl-olie",
  "TODO-traebekyttelse":       "traebeskyttelse-glans-20",

  // Primer / grunder placeholders
  "TODO-primer-indvendig":     "microdispersgrunder-tixotropisk",
  "TODO-betonprimer":          "microdispers-blatonet-inde-ude",
  "TODO-hæftegrunder":         "microdispersgrunder-tixotropisk",
  "TODO-facadeprimer":         "microdispers-blatonet-inde-ude",
  "TODO-traegrunder":          "alkyd-trae-grundingsolie",
  "TODO-udvendig-traegrunder": "alkyd-trae-grundingsolie",
  "TODO-gulvprimer":           "alkyd-trae-grundingsolie",
  "TODO-industriprimer":       "lf-epoxy-primer-upigmenteret",

  // Lars Frey tools
  "TODO-rullehaandtag-25":     "handtag-15-25-cm-handtag",
  "TODO-malerbakke-25":        "malebakke-bakker",
  "TODO-teleskopstang":        "forlaengerskaft",
  "TODO-rullespand":           "rullespand-bakker",
  "TODO-gulvrulle":            "microfiber-gulvrulle",

  // Lars Frey accessories
  "TODO-washi-tape-36":        "washi-tape-premium-tape",
  "TODO-afdaekningsfolie":     "folie-mask-afdaekning",
  "TODO-outdoor-tape":         "projekt-washi-uv-tape-tape",
  "TODO-sandpapir-120":        "sandpapir-d125-5-m-slibepapir",
  "TODO-sandpapir-180":        "sandpapir-d125-5-m-slibepapir",

  // Deliberately left as TODO (no matching product in catalog):
  //   TODO-tapetklister  — wallcovering glue, product doesn't exist
  //   TODO-metalprimer   — dedicated metal primer, product doesn't exist
};

// ─── Apply ──────────────────────────────────────────────────────────

let source = readFileSync(CONFIG_PATH, "utf-8");
const original = source;
const stats = [];

for (const [oldHandle, newHandle] of Object.entries(MAPPINGS)) {
  // Only match inside JSON string values: `"<handle>"`
  const pattern = new RegExp(`"${oldHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
  const matches = source.match(pattern);
  const count = matches ? matches.length : 0;
  if (count === 0) {
    stats.push({ oldHandle, newHandle, count, status: "NO MATCH" });
    continue;
  }
  source = source.replace(pattern, `"${newHandle}"`);
  stats.push({ oldHandle, newHandle, count, status: "REPLACED" });
}

// Report
console.log(`Applying ${Object.keys(MAPPINGS).length} mappings to ${CONFIG_PATH}\n`);
for (const s of stats) {
  const icon = s.status === "REPLACED" ? "✓" : "✗";
  console.log(`  ${icon} ${s.oldHandle.padEnd(30)} → ${s.newHandle.padEnd(40)} (${s.count}×)`);
}

// Sanity check: JSON still parses
const jsonMatch = source.match(/<script[^>]*id="beregner-config"[^>]*>([\s\S]*?)<\/script>/);
try {
  JSON.parse(jsonMatch[1]);
} catch (err) {
  console.error(`\n✗ JSON validation failed after replacement: ${err.message}`);
  console.error(`  Aborting without writing.`);
  process.exit(1);
}

if (source === original) {
  console.log(`\nNo changes to write.`);
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`\nDRY RUN — no file written. Re-run without --dry-run to apply.`);
  process.exit(0);
}

writeFileSync(CONFIG_PATH, source, "utf-8");
console.log(`\nWrote ${CONFIG_PATH}`);
