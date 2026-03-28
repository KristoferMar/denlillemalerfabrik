#!/usr/bin/env node
/**
 * Sets inventory quantity for all paint products.
 *
 * Usage:
 *   node set-inventory.js --dry-run          Preview what will be updated
 *   node set-inventory.js                    Set inventory to 10 for all variants
 *   node set-inventory.js --quantity 50      Set a custom quantity
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const qtyFlagIdx = process.argv.indexOf("--quantity");
const QUANTITY = qtyFlagIdx !== -1 ? parseInt(process.argv[qtyFlagIdx + 1], 10) : 10;

// ─── GraphQL queries ───────────────────────────────────────────────

const GET_PRODUCTS = `
  query GetProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "tag:paint") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 10) {
          nodes {
            id
            sku
            inventoryItem {
              id
              inventoryLevels(first: 1) {
                nodes {
                  id
                  location { id }
                  quantities(names: ["available"]) {
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const SET_INVENTORY = `
  mutation SetInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

// ─── Main ───────────────────────────────────────────────────────────

console.log(`\n📦 DLM Inventory Updater`);
console.log(`   Target quantity: ${QUANTITY}`);
if (DRY_RUN) console.log(`   DRY RUN — no changes will be made`);
console.log();

let cursor = null;
let updated = 0;
let skipped = 0;
let failed = 0;

do {
  const data = await shopifyGraphQL(GET_PRODUCTS, { cursor });
  const { nodes: products, pageInfo } = data.products;

  for (const product of products) {
    console.log(`${product.title}`);

    for (const variant of product.variants.nodes) {
      const inventoryItem = variant.inventoryItem;
      const level = inventoryItem.inventoryLevels.nodes[0];

      if (!level) {
        console.log(`  ⚠ ${variant.sku || variant.id} — no inventory location found`);
        skipped++;
        continue;
      }

      const currentQty = level.quantities?.[0]?.quantity ?? 0;

      if (currentQty === QUANTITY) {
        console.log(`  ✓ ${variant.sku} — already at ${QUANTITY}`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  → ${variant.sku} — would set ${currentQty} → ${QUANTITY}`);
        updated++;
        continue;
      }

      try {
        const result = await shopifyGraphQL(SET_INVENTORY, {
          input: {
            reason: "correction",
            name: "available",
            ignoreCompareQuantity: true,
            quantities: [{
              inventoryItemId: inventoryItem.id,
              locationId: level.location.id,
              quantity: QUANTITY,
            }],
          },
        });

        const errors = result.inventorySetQuantities.userErrors;
        if (errors.length > 0) {
          console.log(`  ✗ ${variant.sku} — ${errors[0].message}`);
          failed++;
        } else {
          console.log(`  ✓ ${variant.sku} — ${currentQty} → ${QUANTITY}`);
          updated++;
        }
      } catch (err) {
        console.log(`  ✗ ${variant.sku} — ${err.message}`);
        failed++;
      }

      await sleep(300);
    }
  }

  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed:  ${failed}`);
