#!/usr/bin/env node
/**
 * Deep-inspects one colored paint product for glans clues:
 * product-level metafields, variant-level metafields, and paint_type ref.
 */

import { shopifyGraphQL } from "../shopify-client.js";

const HANDLE = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? "vaegmaling-snehvid";

const data = await shopifyGraphQL(`
  query ($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      tags
      metafields(first: 50) {
        nodes { namespace key value type reference { __typename ... on Metaobject { handle type fields { key value } } } }
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          metafields(first: 25) {
            nodes { namespace key value type }
          }
        }
      }
    }
  }
`, { handle: HANDLE });

const p = data.productByHandle;
if (!p) {
  console.log(`No product with handle ${HANDLE}`);
  process.exit(1);
}

console.log(`${p.title}  (${p.handle})`);
console.log(`  id: ${p.id}`);
console.log(`  tags: ${p.tags.join(", ")}`);

console.log(`\nProduct metafields (${p.metafields.nodes.length}):`);
for (const m of p.metafields.nodes) {
  console.log(`  ${m.namespace}.${m.key}  [${m.type}]  = ${m.value}`);
  if (m.reference?.__typename === "Metaobject") {
    console.log(`    → metaobject ${m.reference.type} (${m.reference.handle})`);
    for (const f of m.reference.fields) {
      console.log(`        ${f.key} = ${f.value}`);
    }
  }
}

console.log(`\nVariants:`);
for (const v of p.variants.nodes) {
  console.log(`  ${v.title}  sku=${v.sku}`);
  const mfs = v.metafields.nodes;
  if (mfs.length === 0) {
    console.log(`    (no variant metafields)`);
  } else {
    for (const m of mfs) {
      console.log(`    ${m.namespace}.${m.key}  [${m.type}]  = ${m.value}`);
    }
  }
}
