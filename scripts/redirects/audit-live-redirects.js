#!/usr/bin/env node
/**
 * Read-only audit of live /qr/* redirects.
 *
 * Counts total, breaks down by path shape, and flags any pointing to
 * product handles that no longer exist (i.e., would 404 on scan).
 *
 * Usage: node scripts/redirects/audit-live-redirects.js
 */

import { shopifyRest, shopifyGraphQL, sleep } from "../shopify-client.js";

// 1. Fetch all /qr/* redirects.
const all = [];
let sinceId = 0;
while (true) {
  const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
  const batch = res.redirects ?? [];
  all.push(...batch);
  if (batch.length < 250) break;
  sinceId = batch[batch.length - 1].id;
}

const qr = all.filter((r) => r.path.startsWith("/qr/"));
console.log(`Total redirects live: ${all.length}`);
console.log(`/qr/* redirects:      ${qr.length}\n`);

// 2. Group by path shape.
const byShape = new Map();
for (const r of qr) {
  const shape = r.path
    .replace(/dlm\d{2}/i, "dlmTT")
    .replace(/-\d{4}-/g, "-FFSS-")
    .replace(/g\d+$/, "gN");
  byShape.set(shape, (byShape.get(shape) ?? 0) + 1);
}
console.log("Path shapes:");
for (const [k, v] of [...byShape.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}× ${k}`);
}

// 3. Extract unique product handles from targets.
const handleFromTarget = (t) => {
  const m = t.match(/\/products\/([^?#]+)/);
  return m ? m[1] : null;
};
const handles = new Set();
for (const r of qr) {
  const h = handleFromTarget(r.target);
  if (h) handles.add(h);
}
console.log(`\nUnique product handles referenced: ${handles.size}`);

// 4. Check which handles actually exist right now.
async function exists(h) {
  const r = await shopifyGraphQL(
    `query($h:String!){ productByHandle(handle:$h){ id } }`,
    { h }
  );
  return !!r.productByHandle;
}

let alive = 0, dead = 0;
const deadHandles = [];
for (const h of handles) {
  const ok = await exists(h);
  if (ok) alive++;
  else { dead++; deadHandles.push(h); }
  await sleep(50);
}
console.log(`  alive: ${alive}`);
console.log(`  dead:  ${dead}`);

if (deadHandles.length) {
  console.log(`\nDead handles (redirects pointing to deleted products):`);
  for (const h of deadHandles.slice(0, 20)) console.log(`  ${h}`);
  if (deadHandles.length > 20) console.log(`  … +${deadHandles.length - 20} more`);

  // Count redirects per dead handle.
  const deadSet = new Set(deadHandles);
  const brokenRedirects = qr.filter((r) => {
    const h = handleFromTarget(r.target);
    return h && deadSet.has(h);
  });
  console.log(`\nBroken redirects total: ${brokenRedirects.length}`);
}
