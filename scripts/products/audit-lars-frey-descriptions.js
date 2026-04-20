#!/usr/bin/env node
/**
 * Audit: how many Lars Frey accessory products have a real description?
 *
 * Usage: node scripts/products/audit-lars-frey-descriptions.js
 */

import { shopifyGraphQL } from "../shopify-client.js";

const QUERY = `
  query ($cursor: String) {
    products(first: 100, after: $cursor, query: "tag:'Lars Frey'") {
      nodes {
        id
        title
        handle
        descriptionHtml
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const all = [];
let cursor = null;

do {
  const data = await shopifyGraphQL(QUERY, { cursor });
  all.push(...data.products.nodes);
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (cursor);

const withDesc = all.filter((p) => {
  const html = (p.descriptionHtml ?? "").trim();
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, "").trim();
  return text.length >= 20;
});

const withoutDesc = all.filter((p) => !withDesc.includes(p));

console.log(`Total Lars Frey products: ${all.length}`);
console.log(`With real description:    ${withDesc.length}`);
console.log(`Empty / trivial:          ${withoutDesc.length}\n`);

if (withoutDesc.length > 0) {
  console.log("Products missing a real description:");
  for (const p of withoutDesc) {
    console.log(`  ${p.handle.padEnd(50)} — ${p.title}`);
  }
}
