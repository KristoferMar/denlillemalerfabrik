#!/usr/bin/env node
/**
 * Lists all metafield definitions for products.
 */

import { shopifyGraphQL } from "../shopify-client.js";

const data = await shopifyGraphQL(`
  {
    metafieldDefinitions(ownerType: PRODUCT, first: 50) {
      nodes {
        namespace
        key
        name
        type {
          name
        }
        validations {
          name
          value
        }
      }
    }
  }
`);

const defs = data.metafieldDefinitions.nodes;

if (defs.length === 0) {
  console.log("No metafield definitions found for products.");
  process.exit(0);
}

console.log(`\nProduct metafield definitions (${defs.length}):\n`);

for (const d of defs) {
  console.log(`  ${d.namespace}.${d.key} — "${d.name}" (${d.type.name})`);
  if (d.validations.length > 0) {
    for (const v of d.validations) {
      console.log(`    ${v.name}: ${v.value}`);
    }
  }
}
console.log();
