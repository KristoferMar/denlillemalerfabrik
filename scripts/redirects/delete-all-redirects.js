#!/usr/bin/env node
/**
 * Deletes ALL URL redirects in the store.
 *
 * Usage:
 *   node scripts/redirects/delete-all-redirects.js --dry-run   # preview
 *   node scripts/redirects/delete-all-redirects.js              # apply
 */

import { shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");

// Fetch all redirects.
const all = [];
let sinceId = 0;
while (true) {
  const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
  const batch = res.redirects ?? [];
  all.push(...batch);
  if (batch.length < 250) break;
  sinceId = batch[batch.length - 1].id;
}

console.log(`Total redirects found: ${all.length}\n`);

if (all.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

for (const r of all) {
  console.log(`  ${DRY_RUN ? "[dry-run] would delete" : "deleting"}: ${r.path}  →  ${r.target}`);
  if (!DRY_RUN) {
    try {
      await shopifyRest(`redirects/${r.id}.json`, { method: "DELETE" });
    } catch (e) {
      console.error(`    ✗ ERROR: ${e.message}`);
      console.error(`  Aborting.`);
      process.exit(1);
    }
    await sleep(500);
  }
}

console.log(`\nDone. ${all.length} redirects ${DRY_RUN ? "would be" : ""} deleted.${DRY_RUN ? " (dry-run)" : ""}`);
