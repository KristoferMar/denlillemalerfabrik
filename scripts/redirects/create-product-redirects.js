#!/usr/bin/env node
/**
 * Creates one /qr/{handle} redirect per paint product (excluding specialblanding).
 *
 * Each redirect simply lands the user on the product page — they pick
 * color and size on the PDP themselves.
 *
 *   /qr/vaegmaling-glans-5  →  /products/vaegmaling-glans-5
 *
 * Idempotent: skips redirects that already exist with the correct target.
 *
 * Usage:
 *   node scripts/redirects/create-product-redirects.js --dry-run
 *   node scripts/redirects/create-product-redirects.js
 */

import { shopifyGraphQL, shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");

// Fetch paint products (excluding specialblanding).
const all = [];
let cursor = null;
while (true) {
  const data = await shopifyGraphQL(`
    query ($c: String) {
      products(first: 100, after: $c, query: "tag:paint AND -tag:specialblanding") {
        pageInfo { hasNextPage endCursor }
        nodes { id title handle status }
      }
    }
  `, { c: cursor });
  all.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
  await sleep(200);
}

console.log(`Paint products found: ${all.length}\n`);

// Build desired redirects.
const desired = all.map((p) => ({
  path: `/qr/${p.handle}`,
  target: `/products/${p.handle}`,
  title: p.title,
}));

// Fetch existing /qr/* redirects to avoid duplicates.
const existing = [];
let sinceId = 0;
while (true) {
  const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
  const batch = res.redirects ?? [];
  existing.push(...batch);
  if (batch.length < 250) break;
  sinceId = batch[batch.length - 1].id;
}
const existingByPath = new Map(existing.map((r) => [r.path, r]));

let created = 0, unchanged = 0, errors = 0;

for (const d of desired) {
  const current = existingByPath.get(d.path);

  if (current && current.target === d.target) {
    console.log(`  [skip] ${d.path} — already exists`);
    unchanged++;
    continue;
  }

  console.log(`  + ${d.path}  →  ${d.target}  (${d.title})`);
  if (DRY_RUN) { created++; continue; }

  try {
    if (current) {
      await shopifyRest(`redirects/${current.id}.json`, {
        method: "PUT",
        body: { redirect: { id: current.id, path: d.path, target: d.target } },
      });
    } else {
      await shopifyRest("redirects.json", {
        method: "POST",
        body: { redirect: { path: d.path, target: d.target } },
      });
    }
    created++;
  } catch (e) {
    console.error(`    ✗ ERROR: ${e.message}`);
    errors++;
    console.error(`  Aborting.`);
    process.exit(1);
  }
  await sleep(500);
}

console.log(
  `\nDone.  created=${created}  unchanged=${unchanged}  errors=${errors}${DRY_RUN ? "  (dry-run)" : ""}`
);
