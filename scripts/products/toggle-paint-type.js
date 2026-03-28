#!/usr/bin/env node
/**
 * Enable or disable all products matching a paint type tag.
 *
 * Sets product status to ACTIVE or DRAFT based on tag filter.
 *
 * Usage:
 *   node toggle-paint-type.js <tag-value> <active|draft> [--dry-run]
 *
 * Examples:
 *   node toggle-paint-type.js paint-type:loftmaling draft       Disable all Loftmaling
 *   node toggle-paint-type.js paint-type:loftmaling active      Re-enable all Loftmaling
 *   node toggle-paint-type.js color-family:blues draft           Disable all blue products
 *   node toggle-paint-type.js paint-type-prefix:30 draft         Disable by prefix
 *   node toggle-paint-type.js paint draft                        Disable ALL paint products
 *   node toggle-paint-type.js paint-type:gulvmaling draft --dry-run   Preview only
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");

if (args.length < 2) {
  console.error("Usage: node toggle-paint-type.js <tag> <active|draft> [--dry-run]");
  console.error("");
  console.error("Tags you can use:");
  console.error("  paint                         All paint products");
  console.error("  paint-type:vaegmaling         All wall paint");
  console.error("  paint-type:loftmaling         All ceiling paint");
  console.error("  paint-type:trae-og-metal      All wood & metal paint");
  console.error("  paint-type:strukturmaling     All textured paint");
  console.error("  paint-type:traebeskyttelse    All wood protection");
  console.error("  paint-type:gulvmaling         All floor paint");
  console.error("  paint-type-prefix:10          By type prefix number");
  console.error("  color-family:blues            By color family");
  console.error("  color-code:DLM0203            Specific color across types");
  process.exit(1);
}

const [tagFilter, action] = args;
const status = action.toUpperCase();

if (status !== "ACTIVE" && status !== "DRAFT") {
  console.error(`Invalid action: "${action}". Use "active" or "draft".`);
  process.exit(1);
}

// ─── GraphQL ────────────────────────────────────────────────────────

const LIST_PRODUCTS = `
  query ListProducts($cursor: String, $query: String!) {
    products(first: 50, after: $cursor, query: $query) {
      nodes {
        id
        title
        status
        tags
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Fetch matching products ────────────────────────────────────────

async function fetchProducts(tag) {
  const products = [];
  let cursor = null;

  while (true) {
    const data = await shopifyGraphQL(LIST_PRODUCTS, {
      cursor,
      query: `tag:'${tag}'`,
    });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(300);
  }

  return products;
}

// ─── Main ───────────────────────────────────────────────────────────

console.log(`\nSearching for products with tag: "${tagFilter}"...`);
const products = await fetchProducts(tagFilter);

if (products.length === 0) {
  console.log("No products found matching that tag.");
  process.exit(0);
}

// Filter to only products that need changing
const toUpdate = products.filter((p) => p.status !== status);
const alreadyCorrect = products.length - toUpdate.length;

console.log(`Found ${products.length} products with tag "${tagFilter}"`);
console.log(`  ${alreadyCorrect} already ${status}`);
console.log(`  ${toUpdate.length} to update → ${status}\n`);

if (toUpdate.length === 0) {
  console.log("Nothing to update.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("DRY RUN — would update:\n");
  for (const p of toUpdate) {
    console.log(`  ${p.title}  (${p.status} → ${status})`);
  }
  process.exit(0);
}

let updated = 0;
let failed = 0;

for (const p of toUpdate) {
  try {
    await shopifyGraphQL(UPDATE_PRODUCT, {
      input: { id: p.id, status },
    });
    console.log(`  ✓ ${p.title}  (${p.status} → ${status})`);
    updated++;
  } catch (err) {
    console.log(`  ✗ ${p.title} — ${err.message}`);
    failed++;
  }
  await sleep(300);
}

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}`);
console.log(`Failed:  ${failed}`);
console.log(`Skipped: ${alreadyCorrect} (already ${status})`);
