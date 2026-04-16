#!/usr/bin/env node
/**
 * Audits every product tagged `paint` (all DLM colored products):
 *   - groups by paint-type tag
 *   - shows existing variants + sizes + SKUs
 *   - surfaces any inconsistencies (missing tags, weird sizes, duplicate codes)
 *
 * Read-only. Safe to run anytime.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const QUERY = `
  query ($cursor: String) {
    products(first: 100, after: $cursor, query: "tag:paint") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        tags
        options { name values }
        variants(first: 50) {
          nodes { id title sku inventoryQuantity price }
        }
      }
    }
  }
`;

async function fetchAll() {
  const all = [];
  let cursor = null;
  while (true) {
    const data = await shopifyGraphQL(QUERY, { cursor });
    all.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(200);
  }
  return all;
}

function parseTags(tags) {
  const parsed = {};
  for (const t of tags) {
    const i = t.indexOf(":");
    if (i !== -1) parsed[t.slice(0, i)] = t.slice(i + 1);
  }
  return parsed;
}

const products = await fetchAll();

// Group by paint-type tag
const byType = new Map();
const untagged = [];
for (const p of products) {
  const tags = parseTags(p.tags);
  const type = tags["paint-type"] ?? tags["specialblanding-type"];
  if (!type) {
    untagged.push(p);
    continue;
  }
  if (!byType.has(type)) byType.set(type, []);
  byType.get(type).push({ ...p, _parsed: tags });
}

console.log(`Audited ${products.length} paint-tagged products.\n`);

for (const [type, items] of [...byType.entries()].sort()) {
  console.log(`━━━ ${type.toUpperCase()} — ${items.length} products ━━━`);

  // Size grid distribution
  const sizeSets = new Map();
  for (const p of items) {
    const szOption = p.options.find((o) => /størrelse|size/i.test(o.name));
    const key = szOption ? szOption.values.join("/") : "(no size option)";
    sizeSets.set(key, (sizeSets.get(key) ?? 0) + 1);
  }
  console.log(`  Size grids in use:`);
  for (const [k, v] of sizeSets) console.log(`    ${v}× ${k}`);

  // Existing options (should be just "Størrelse" — flag anything else)
  const optionNames = new Map();
  for (const p of items) {
    for (const o of p.options) {
      optionNames.set(o.name, (optionNames.get(o.name) ?? 0) + 1);
    }
  }
  console.log(`  Option names in use:`);
  for (const [k, v] of optionNames) console.log(`    ${v}× ${k}`);

  // Sample 3 products
  console.log(`  Sample:`);
  for (const p of items.slice(0, 3)) {
    const fullCode = p._parsed["full-code"] ?? "(no full-code)";
    console.log(`    ${p.title}  —  full-code: ${fullCode}`);
    for (const v of p.variants.nodes) {
      console.log(`      ${v.title.padEnd(10)} sku=${(v.sku ?? "").padEnd(22)} price=${v.price}  inv=${v.inventoryQuantity}`);
    }
  }
  console.log();
}

if (untagged.length) {
  console.log(`━━━ WITHOUT paint-type / specialblanding-type tag — ${untagged.length} ━━━`);
  for (const p of untagged) {
    console.log(`  ${p.title}  (${p.handle})`);
  }
  console.log();
}

// Duplicate full-code check
const seenCodes = new Map();
for (const p of products) {
  const tags = parseTags(p.tags);
  const code = tags["full-code"];
  if (!code) continue;
  if (!seenCodes.has(code)) seenCodes.set(code, []);
  seenCodes.get(code).push(p.handle);
}
const duplicates = [...seenCodes.entries()].filter(([, v]) => v.length > 1);
if (duplicates.length) {
  console.log(`━━━ DUPLICATE full-code tags ━━━`);
  for (const [code, handles] of duplicates) {
    console.log(`  ${code} → ${handles.join(", ")}`);
  }
} else {
  console.log(`No duplicate full-code tags detected.`);
}
