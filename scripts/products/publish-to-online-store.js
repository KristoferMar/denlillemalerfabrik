#!/usr/bin/env node
/**
 * Publishes all Lars Frey products to the Online Store sales channel.
 * Uses productPublish mutation which works with write_products scope.
 *
 * Usage:
 *   node publish-to-online-store.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// Step 1: Fetch all Lars Frey products
const LIST_PRODUCTS = `
  query ListProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "vendor:'Lars Frey Farve og Lak'") {
      nodes {
        id
        title
        publishedOnCurrentChannel
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const products = [];
let cursor = null;

while (true) {
  const data = await shopifyGraphQL(LIST_PRODUCTS, { cursor });
  products.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
  await sleep(300);
}

const unpublished = products.filter((p) => !p.publishedOnCurrentChannel);
console.log(`Found ${products.length} products total, ${unpublished.length} not on Online Store.\n`);

if (unpublished.length === 0) {
  console.log("All products are already published to Online Store.");
  process.exit(0);
}

// Step 2: Publish using productPublish
const PUBLISH = `
  mutation ProductPublish($input: ProductPublishInput!) {
    productPublish(input: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// We need the Online Store publication ID — try getting it via a product's channel info
// If productPublish doesn't work, fall back to asking user to do it manually

let published = 0;
let failed = 0;

for (const p of unpublished) {
  try {
    const result = await shopifyGraphQL(PUBLISH, {
      input: {
        id: p.id,
        productPublications: [
          {
            channelHandle: "online-store",
          },
        ],
      },
    });

    const errors = result.productPublish.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${p.title} — ${errors[0].message}`);
      failed++;
    } else {
      console.log(`  ✓ ${p.title}`);
      published++;
    }
  } catch (err) {
    console.log(`  ✗ ${p.title} — ${err.message}`);
    failed++;
  }
  await sleep(300);
}

console.log(`\nDone! Published: ${published}, Failed: ${failed}`);
