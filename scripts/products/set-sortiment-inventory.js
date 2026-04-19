#!/usr/bin/env node
/**
 * Sortiment & Lars Frey tilbehør products are physical items with finite
 * stock. This script sets every non-paint, non-legacy variant to
 * `available = 10` at its primary location, and enables tracking if it
 * was off. Rationale: customer will replenish 10x on first sale — this
 * establishes the baseline.
 *
 * Scope: all products EXCEPT `tag:paint` and the 4 legacy handles below.
 * Idempotent: variants already at the target quantity and already tracked
 * are skipped.
 *
 * Usage:
 *   node scripts/products/set-sortiment-inventory.js --dry-run
 *   node scripts/products/set-sortiment-inventory.js
 *   node scripts/products/set-sortiment-inventory.js --quantity 20
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const qtyFlagIdx = process.argv.indexOf("--quantity");
const QUANTITY = qtyFlagIdx !== -1 ? parseInt(process.argv[qtyFlagIdx + 1], 10) : 10;

// Parked on "Decide legacy products" todo — exclude until that's resolved.
const LEGACY_HANDLES = new Set([
  "trae-glans-40",
  "interior-glans-5",
  "interior-glans-10-bla",
  "loft-glans-25",
]);

const GET_PRODUCTS = `
  query GetNonPaintProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "-tag:paint") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        variants(first: 100) {
          nodes {
            id
            sku
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 1) {
                nodes {
                  id
                  location { id }
                  quantities(names: ["available"]) { quantity }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ENABLE_TRACKING = `
  mutation EnableTracking($id: ID!) {
    inventoryItemUpdate(id: $id, input: { tracked: true }) {
      inventoryItem { id tracked }
      userErrors { field message }
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

console.log(`\nSet sortiment inventory`);
console.log(`Target quantity: ${QUANTITY}`);
if (DRY_RUN) console.log(`DRY RUN — no changes will be made`);
console.log();

// We need a location id for variants that have no inventoryLevels yet.
// We'll discover one from the first tracked variant we see.
let defaultLocationId = null;

let cursor = null;
let updated = 0;
let trackingEnabled = 0;
let skipped = 0;
let failed = 0;
let productsScanned = 0;
let productsSkippedLegacy = 0;

do {
  const data = await shopifyGraphQL(GET_PRODUCTS, { cursor });
  const { nodes: products, pageInfo } = data.products;

  for (const product of products) {
    if (LEGACY_HANDLES.has(product.handle)) {
      productsSkippedLegacy++;
      continue;
    }
    productsScanned++;
    console.log(`${product.title}  (${product.variants.nodes.length} variants)`);

    for (const variant of product.variants.nodes) {
      const item = variant.inventoryItem;
      const level = item.inventoryLevels.nodes[0];
      const label = variant.sku || variant.id;

      if (level?.location?.id && !defaultLocationId) {
        defaultLocationId = level.location.id;
      }

      // Enable tracking if currently off
      if (item.tracked === false) {
        if (DRY_RUN) {
          console.log(`  → ${label} — would enable tracking`);
        } else {
          try {
            const r = await shopifyGraphQL(ENABLE_TRACKING, { id: item.id });
            const errs = r.inventoryItemUpdate.userErrors;
            if (errs.length > 0) {
              console.log(`  ✗ ${label} — enable tracking failed: ${errs[0].message}`);
              failed++;
              continue;
            }
            trackingEnabled++;
          } catch (err) {
            console.log(`  ✗ ${label} — enable tracking error: ${err.message}`);
            failed++;
            continue;
          }
          await sleep(150);
        }
      }

      const currentQty = level?.quantities?.[0]?.quantity ?? null;

      // Idempotency: already at target AND tracked — skip
      if (currentQty === QUANTITY && item.tracked !== false) {
        skipped++;
        continue;
      }

      const locationId = level?.location?.id || defaultLocationId;
      if (!locationId) {
        console.log(`  ⚠ ${label} — no location known yet, will retry after first tracked variant`);
        failed++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  → ${label} — would set ${currentQty ?? "(unset)"} → ${QUANTITY}`);
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
              inventoryItemId: item.id,
              locationId,
              quantity: QUANTITY,
            }],
          },
        });
        const errors = result.inventorySetQuantities.userErrors;
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

      await sleep(200);
    }
  }

  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

console.log(`\n--- Summary ---`);
console.log(`Products scanned:    ${productsScanned}`);
console.log(`Legacy skipped:      ${productsSkippedLegacy}`);
console.log(`Tracking enabled:    ${trackingEnabled}`);
console.log(`Quantity set:        ${updated}`);
console.log(`Already at target:   ${skipped}`);
console.log(`Failed:              ${failed}`);
if (failed > 0) process.exit(1);
