#!/usr/bin/env node
/**
 * Creates ONE test URL redirect for Vægmaling — Murstensrød (5L),
 * then verifies it exists. Also supports list + cleanup.
 *
 * Uses Shopify REST (the urlRedirects GraphQL API requires a
 * different scope that isn't currently granted).
 *
 * Usage:
 *   node scripts/redirects/test-redirect.js          # create + verify
 *   node scripts/redirects/test-redirect.js --list   # list all redirects
 *   node scripts/redirects/test-redirect.js --delete # delete the test redirect
 */

import { shopifyGraphQL, shopifyRest, getScriptArgs } from "../shopify-client.js";

const args = getScriptArgs();
const MODE = args.includes("--delete")
  ? "delete"
  : args.includes("--list")
    ? "list"
    : "create";

const TEST_PATH = "/qr/test-murstensrod-5l";

// ─── Helpers ───────────────────────────────────────────────────────
async function fetchFiveLVariantId() {
  const data = await shopifyGraphQL(`
    {
      productByHandle(handle: "vaegmaling-murstensrod") {
        variants(first: 10) { nodes { id title } }
      }
    }
  `);
  const v = data.productByHandle.variants.nodes.find((n) => n.title === "5L")
    ?? data.productByHandle.variants.nodes[0];
  return { numericId: v.id.split("/").pop(), title: v.title };
}

async function findExisting() {
  const res = await shopifyRest(`redirects.json?path=${encodeURIComponent(TEST_PATH)}`);
  return res.redirects?.[0] ?? null;
}

async function listAll() {
  const res = await shopifyRest(`redirects.json?limit=250`);
  return res.redirects ?? [];
}

// ─── Modes ─────────────────────────────────────────────────────────
if (MODE === "list") {
  const all = await listAll();
  console.log(`Existing redirects (${all.length}):\n`);
  for (const r of all) console.log(`  ${r.path}  →  ${r.target}`);
  process.exit(0);
}

if (MODE === "delete") {
  const existing = await findExisting();
  if (!existing) {
    console.log(`No redirect at ${TEST_PATH}. Nothing to delete.`);
    process.exit(0);
  }
  await shopifyRest(`redirects/${existing.id}.json`, { method: "DELETE" });
  console.log(`Deleted: ${TEST_PATH} (id ${existing.id})`);
  process.exit(0);
}

// MODE === "create"
const variant = await fetchFiveLVariantId();
const target = `/products/vaegmaling-murstensrod?variant=${variant.numericId}`;

console.log(`Creating test redirect:`);
console.log(`  from: ${TEST_PATH}`);
console.log(`  to:   ${target}  (variant ${variant.title})\n`);

const existing = await findExisting();
if (existing) {
  console.log(`Already exists (id ${existing.id}). Updating target…`);
  const res = await shopifyRest(`redirects/${existing.id}.json`, {
    method: "PUT",
    body: { redirect: { id: existing.id, path: TEST_PATH, target } },
  });
  console.log(`Updated: ${res.redirect.path} → ${res.redirect.target}`);
} else {
  const res = await shopifyRest(`redirects.json`, {
    method: "POST",
    body: { redirect: { path: TEST_PATH, target } },
  });
  console.log(`Created: ${res.redirect.path} → ${res.redirect.target}  (id ${res.redirect.id})`);
}

console.log(`\nTry it in the browser:`);
console.log(`  https://den-lille-malerfabrik.myshopify.com${TEST_PATH}`);
console.log(`\nInspect in admin:`);
console.log(`  https://admin.shopify.com/store/den-lille-malerfabrik/redirects`);
console.log(`\nTo remove it:`);
console.log(`  node scripts/redirects/test-redirect.js --delete`);
