#!/usr/bin/env node
/**
 * Publishes all draft "Lars Frey" products (sets status to ACTIVE).
 *
 * Usage:
 *   node publish-products.js --dry-run    Preview
 *   node publish-products.js              Publish
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

const LIST_PRODUCTS = `
  query ListProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "vendor:'Lars Frey Farve og Lak' status:draft") {
      nodes {
        id
        title
        status
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const UPDATE_STATUS = `
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

// Fetch all draft products
const products = [];
let cursor = null;

while (true) {
  const data = await shopifyGraphQL(LIST_PRODUCTS, { cursor });
  products.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
  await sleep(300);
}

console.log(`Found ${products.length} draft products.\n`);

if (products.length === 0) {
  console.log("Nothing to publish.");
  process.exit(0);
}

if (DRY_RUN) {
  for (const p of products) {
    console.log(`  📦 ${p.title}`);
  }
  console.log(`\nDRY RUN — would publish ${products.length} products.`);
  process.exit(0);
}

let published = 0;
let failed = 0;

for (const p of products) {
  const result = await shopifyGraphQL(UPDATE_STATUS, {
    input: {
      id: p.id,
      status: "ACTIVE",
    },
  });

  const errors = result.productUpdate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${p.title} — ${errors[0].message}`);
    failed++;
  } else {
    console.log(`  ✓ ${p.title}`);
    published++;
  }
  await sleep(300);
}

console.log(`\nDone! Published: ${published}, Failed: ${failed}`);
