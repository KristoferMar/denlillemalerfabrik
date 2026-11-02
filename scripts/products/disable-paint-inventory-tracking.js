#!/usr/bin/env node
/**
 * Paint products are mixed on-demand at the factory — they should never
 * appear out of stock. This script flips `inventoryItem.tracked` to false
 * on every variant of every `tag:paint` product, so Shopify stops gating
 * add-to-cart on quantities.
 *
 * Idempotent: variants already untracked are skipped.
 *
 * Implementation notes:
 *   - Paginates products AND paginates variants per product (some products
 *     have 800 variants — color × size — so a single page is not enough).
 *   - Uses `productVariantsBulkUpdate` to flip up to 200 variants per call,
 *     so a fresh run on ~6,100 variants completes in ~30 seconds.
 *
 * Usage:
 *   node scripts/products/disable-paint-inventory-tracking.js --dry-run
 *   node scripts/products/disable-paint-inventory-tracking.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 200; // productVariantsBulkUpdate limit

const GET_PRODUCTS = `
  query GetPaintProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "tag:paint") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variantsCount { count }
      }
    }
  }
`;

const GET_VARIANTS = `
  query GetVariants($productId: ID!, $cursor: String) {
    product(id: $productId) {
      variants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          sku
          inventoryItem { tracked }
        }
      }
    }
  }
`;

const BULK_UPDATE = `
  mutation BulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

/** Fetch every variant for one product, following the cursor as needed. */
async function fetchAllVariants(productId) {
  const variants = [];
  let cursor = null;
  do {
    const data = await shopifyGraphQL(GET_VARIANTS, { productId, cursor });
    const page = data.product.variants;
    variants.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return variants;
}

/** Split an array into fixed-size chunks. */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

console.log(`\nDisable paint inventory tracking`);
if (DRY_RUN) console.log(`DRY RUN — no changes will be made`);
console.log();

let cursor = null;
let updated = 0;
let skipped = 0;
let failed = 0;

do {
  const data = await shopifyGraphQL(GET_PRODUCTS, { cursor });
  const { nodes: products, pageInfo } = data.products;

  for (const product of products) {
    const allVariants = await fetchAllVariants(product.id);
    const stillTracked = allVariants.filter((v) => v.inventoryItem.tracked !== false);
    skipped += allVariants.length - stillTracked.length;

    console.log(
      `${product.title}  (${allVariants.length} variants, ${stillTracked.length} still tracked)`
    );

    if (stillTracked.length === 0) continue;

    if (DRY_RUN) {
      for (const v of stillTracked) {
        console.log(`  → ${v.sku || v.id} — would set tracked=false`);
      }
      updated += stillTracked.length;
      continue;
    }

    for (const batch of chunk(stillTracked, BATCH_SIZE)) {
      const variants = batch.map((v) => ({
        id: v.id,
        inventoryItem: { tracked: false },
      }));
      try {
        const result = await shopifyGraphQL(BULK_UPDATE, {
          productId: product.id,
          variants,
        });
        const errors = result.productVariantsBulkUpdate.userErrors;
        if (errors.length > 0) {
          console.log(`  ✗ batch failed — ${errors[0].message}`);
          failed += batch.length;
        } else {
          updated += batch.length;
          console.log(`  ✓ updated ${batch.length} variants`);
        }
      } catch (err) {
        console.log(`  ✗ batch failed — ${err.message}`);
        failed += batch.length;
      }

      // Light pacing between batches (well under Shopify's rate limits)
      await sleep(150);
    }
  }

  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

console.log(`\n--- Summary ---`);
console.log(`Untracked (updated): ${updated}`);
console.log(`Already untracked:   ${skipped}`);
console.log(`Failed:              ${failed}`);
if (failed > 0) process.exit(1);
