#!/usr/bin/env node
/**
 * Paint products are mixed on-demand at the factory — they should never
 * appear out of stock. This script flips `inventoryItem.tracked` to false
 * on every variant of every `tag:paint` product, so Shopify stops gating
 * add-to-cart on quantities.
 *
 * Idempotent: already-untracked variants are skipped.
 *
 * Usage:
 *   node scripts/products/disable-paint-inventory-tracking.js --dry-run
 *   node scripts/products/disable-paint-inventory-tracking.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

const GET_PRODUCTS = `
  query GetPaintProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "tag:paint") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            sku
            inventoryItem { id tracked }
          }
        }
      }
    }
  }
`;

const UPDATE_INVENTORY_ITEM = `
  mutation DisableTracking($id: ID!) {
    inventoryItemUpdate(id: $id, input: { tracked: false }) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

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
    console.log(`${product.title}  (${product.variants.nodes.length} variants)`);

    for (const variant of product.variants.nodes) {
      const item = variant.inventoryItem;
      const label = variant.sku || variant.id;

      if (item.tracked === false) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  → ${label} — would set tracked=false`);
        updated++;
        continue;
      }

      try {
        const result = await shopifyGraphQL(UPDATE_INVENTORY_ITEM, { id: item.id });
        const errors = result.inventoryItemUpdate.userErrors;
        if (errors.length > 0) {
          console.log(`  ✗ ${label} — ${errors[0].message}`);
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        console.log(`  ✗ ${label} — ${err.message}`);
        failed++;
      }

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
