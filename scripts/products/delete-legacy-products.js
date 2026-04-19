#!/usr/bin/env node
/**
 * Hard-deletes the 4 pre-restructure "legacy" DLM products that don't fit
 * either taxonomy (no `paint` or `sortiment` tag) and are all covered by
 * the new glans-based paint line or outside the customer's production
 * capability (source of truth: sortiment.xlsx).
 *
 *   - trae-glans-40         → covered by new "Træ & Metal Glans 40"
 *   - interior-glans-5      → covered by new "Vægmaling Glans 5"
 *   - interior-glans-10-bla → covered by new "Vægmaling Glans 10" (blue variant)
 *   - loft-glans-25         → not produced by customer (Loftmaling: Glans 2, 5 only)
 *
 * Safety: fetches each handle first, reports title/variants/collections,
 * aborts on fetch errors. Idempotent: missing handles are noted and skipped.
 *
 * Usage:
 *   node scripts/products/delete-legacy-products.js --dry-run
 *   node scripts/products/delete-legacy-products.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY_HANDLES = [
  "trae-glans-40",
  "interior-glans-5",
  "interior-glans-10-bla",
  "loft-glans-25",
];

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      totalInventory
      collections(first: 10) { nodes { id title handle } }
      variants(first: 10) { nodes { id sku } }
    }
  }
`;

const DELETE_PRODUCT = `
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

console.log(`\nDelete legacy products`);
if (DRY_RUN) console.log(`DRY RUN — no changes will be made`);
console.log();

// Fetch-all-first, delete-after — so we abort before any destructive call
// if even one lookup errors.
const toDelete = [];
const alreadyGone = [];

for (const handle of LEGACY_HANDLES) {
  const data = await shopifyGraphQL(GET_PRODUCT, { handle });
  const p = data.productByHandle;
  if (!p) {
    alreadyGone.push(handle);
    console.log(`  (already deleted) ${handle}`);
    continue;
  }
  toDelete.push(p);
  const collectionNames = p.collections.nodes.map((c) => c.title).join(", ") || "—";
  console.log(`  ${p.title}`);
  console.log(`    handle:     ${handle}`);
  console.log(`    id:         ${p.id}`);
  console.log(`    inventory:  ${p.totalInventory}`);
  console.log(`    variants:   ${p.variants.nodes.length}`);
  console.log(`    collections: ${collectionNames}`);
  console.log();
}

if (toDelete.length === 0) {
  console.log(`Nothing to delete. ${alreadyGone.length} already gone.`);
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`DRY RUN — would delete ${toDelete.length} products.`);
  process.exit(0);
}

let deleted = 0;
let failed = 0;

for (const p of toDelete) {
  try {
    const result = await shopifyGraphQL(DELETE_PRODUCT, { input: { id: p.id } });
    const errors = result.productDelete.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${p.title} — ${errors[0].message}`);
      failed++;
    } else {
      console.log(`  ✓ ${p.title} deleted (${result.productDelete.deletedProductId})`);
      deleted++;
    }
  } catch (err) {
    console.log(`  ✗ ${p.title} — ${err.message}`);
    failed++;
  }
  await sleep(300);
}

console.log(`\n--- Summary ---`);
console.log(`Deleted:       ${deleted}`);
console.log(`Already gone:  ${alreadyGone.length}`);
console.log(`Failed:        ${failed}`);
if (failed > 0) process.exit(1);
