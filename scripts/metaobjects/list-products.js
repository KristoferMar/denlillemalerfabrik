#!/usr/bin/env node
/**
 * Lists all products in the store with their metafield assignments.
 */

import { shopifyGraphQL } from "../shopify-client.js";

const data = await shopifyGraphQL(`
  {
    products(first: 50) {
      nodes {
        id
        title
        handle
        metafields(first: 10) {
          nodes {
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`);

const products = data.products.nodes;

if (products.length === 0) {
  console.log("No products found in the store.");
  process.exit(0);
}

console.log(`\nProducts in store (${products.length}):\n`);

for (const p of products) {
  console.log(`  ${p.title}`);
  console.log(`    Handle: ${p.handle}`);
  console.log(`    ID: ${p.id}`);

  const metafields = p.metafields.nodes;
  if (metafields.length > 0) {
    for (const m of metafields) {
      console.log(`    ${m.namespace}.${m.key} = ${m.value}`);
    }
  } else {
    console.log(`    (no metafields assigned)`);
  }
  console.log();
}
