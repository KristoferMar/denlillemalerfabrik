#!/usr/bin/env node
/**
 * Creates URL redirects from deleted/renamed pre-restructure product handles
 * to their post-restructure replacements, so old links (SEO, bookmarks,
 * printed material) don't 404.
 *
 * Idempotent: skips redirects that already exist with the correct target.
 *
 * Usage:
 *   node scripts/redirects/create-legacy-product-redirects.js --dry-run
 *   node scripts/redirects/create-legacy-product-redirects.js
 */

import { shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");

const REDIRECTS = [
  { path: "/products/strukturmaling",         target: "/products/strukturmaling-glans-5" },
  { path: "/products/trae-glans-40",          target: "/products/trae-metal-glans-40" },
  { path: "/products/interior-glans-5",       target: "/products/vaegmaling-glans-5" },
  { path: "/products/interior-glans-10-bla",  target: "/products/vaegmaling-glans-10" },
  { path: "/products/loft-glans-25",          target: "/collections/loftmaling" },
  // Loftmaling Glans 2 — deleted because not in sortiment.xlsx (customer doesn't produce it)
  { path: "/products/loftmaling-glans-2",     target: "/products/loftmaling-glans-5" },
];

console.log(`Legacy product redirects`);
if (DRY_RUN) console.log(`DRY RUN — no changes will be made`);
console.log();

// Fetch all existing redirects so we can detect duplicates / diffs.
const existing = [];
let sinceId = 0;
while (true) {
  const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
  const batch = res.redirects ?? [];
  existing.push(...batch);
  if (batch.length < 250) break;
  sinceId = batch[batch.length - 1].id;
}
const byPath = new Map(existing.map((r) => [r.path, r]));

let created = 0;
let updated = 0;
let unchanged = 0;
let errors = 0;

for (const d of REDIRECTS) {
  const current = byPath.get(d.path);

  if (current && current.target === d.target) {
    console.log(`  [skip] ${d.path}  — already → ${d.target}`);
    unchanged++;
    continue;
  }

  if (current) {
    console.log(`  ~ ${d.path}  ${current.target}  →  ${d.target}`);
  } else {
    console.log(`  + ${d.path}  →  ${d.target}`);
  }

  if (DRY_RUN) {
    if (current) updated++; else created++;
    continue;
  }

  try {
    if (current) {
      await shopifyRest(`redirects/${current.id}.json`, {
        method: "PUT",
        body: { redirect: { id: current.id, path: d.path, target: d.target } },
      });
      updated++;
    } else {
      await shopifyRest("redirects.json", {
        method: "POST",
        body: { redirect: { path: d.path, target: d.target } },
      });
      created++;
    }
  } catch (e) {
    console.error(`    ✗ ${e.message}`);
    errors++;
    console.error(`  Aborting.`);
    process.exit(1);
  }
  await sleep(400);
}

console.log(`\nDone.  created=${created}  updated=${updated}  unchanged=${unchanged}  errors=${errors}${DRY_RUN ? "  (dry-run)" : ""}`);
