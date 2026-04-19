#!/usr/bin/env node
/**
 * One-off fix: Vægmaling Glans 10's 3L variants carry SKUs ending in `-5L`
 * (leftover from when the small size was 5 L before it was relabeled to 3 L).
 * This script rewrites the trailing `-5L` to `-3L` on every variant whose
 * Størrelse option is `3L` and whose current SKU ends in `-5L`.
 *
 * Scope: product handle `vaegmaling-glans-10` only.
 * Affects: SKU field only — no variant IDs, options, prices, or inventory.
 * Re-running is safe: variants already ending in `-3L` are skipped.
 *
 * Usage:
 *   node scripts/products/fix-vaegmaling-glans-10-skus.js --dry-run   # preview
 *   node scripts/products/fix-vaegmaling-glans-10-skus.js             # apply
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const HANDLE = "vaegmaling-glans-10";

// ─── GraphQL ────────────────────────────────────────────────────────

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      variants(first: 100) {
        nodes {
          id
          title
          sku
          selectedOptions { name value }
        }
      }
    }
  }
`;

const UPDATE_VARIANTS = `
  mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

// ─── Main ───────────────────────────────────────────────────────────

const data = await shopifyGraphQL(GET_PRODUCT, { handle: HANDLE });
const product = data.productByHandle;

if (!product) {
  console.error(`Product with handle "${HANDLE}" not found.`);
  process.exit(1);
}

console.log(`Product: ${product.title} (${product.id})`);
console.log(`Variants: ${product.variants.nodes.length}\n`);

// Find 3L variants whose SKU ends in -5L
const renames = [];
for (const v of product.variants.nodes) {
  const size = v.selectedOptions.find((o) => o.name === "Størrelse")?.value;
  if (size !== "3L") continue;
  if (!v.sku || !v.sku.endsWith("-5L")) continue;
  const newSku = v.sku.replace(/-5L$/, "-3L");
  renames.push({ id: v.id, title: v.title, oldSku: v.sku, newSku });
}

if (renames.length === 0) {
  console.log("Nothing to do — no 3L variants with a -5L SKU found.");
  process.exit(0);
}

console.log(`Planned renames (${renames.length}):\n`);
for (const r of renames) {
  console.log(`  ${r.title.padEnd(24)} ${r.oldSku}  →  ${r.newSku}`);
}

if (DRY_RUN) {
  console.log(`\nDRY RUN — no writes. Re-run without --dry-run to apply.`);
  process.exit(0);
}

// Apply in batches (Shopify caps bulk mutations at 250 entries; use 50 to stay gentle)
const BATCH_SIZE = 50;
let updated = 0;

for (let i = 0; i < renames.length; i += BATCH_SIZE) {
  const batch = renames.slice(i, i + BATCH_SIZE);
  const result = await shopifyGraphQL(UPDATE_VARIANTS, {
    productId: product.id,
    variants: batch.map((r) => ({
      id: r.id,
      inventoryItem: { sku: r.newSku },
    })),
  });

  const errors = result.productVariantsBulkUpdate.userErrors;
  if (errors.length > 0) {
    console.error(`\nBatch ${i / BATCH_SIZE + 1} errors:`);
    for (const e of errors) console.error(`  - ${e.field?.join(".")}: ${e.message}`);
    console.error(`\nAborting. ${updated} variants were updated before failure.`);
    process.exit(1);
  }

  updated += result.productVariantsBulkUpdate.productVariants.length;
  await sleep(300);
}

console.log(`\nDone. Updated ${updated} variant SKUs.`);
