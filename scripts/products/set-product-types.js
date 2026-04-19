#!/usr/bin/env node
/**
 * Fills the Shopify `productType` field for every product. Currently empty
 * on all products; populating it improves Shopify admin search, Google
 * Merchant feed, schema.org output, and app-level segmentation.
 *
 * Mapping (priority order — first match wins):
 *   1. tag:specialblanding            → "Specialblanding"
 *   2. paint-type:{type} tag          → canonical Danish name (Vægmaling, Loftmaling, …)
 *   3. kategori:{cat} tag             → human label (Spartel & forbehandling, Vægbeklædning, …)
 *   4. vendor "Lars Frey Farve og Lak" → "Tilbehør"
 *   5. otherwise                      → skip with a warning
 *
 * Idempotent: products already at the target productType are skipped.
 *
 * Usage:
 *   node scripts/products/set-product-types.js --dry-run
 *   node scripts/products/set-product-types.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

const PAINT_TYPE_MAP = {
  "paint-type:vaegmaling":      "Vægmaling",
  "paint-type:loftmaling":      "Loftmaling",
  "paint-type:trae-og-metal":   "Træ & Metal",
  "paint-type:strukturmaling":  "Strukturmaling",
  "paint-type:traebeskyttelse": "Træbeskyttelse",
  "paint-type:gulvmaling":      "Gulvmaling",
};

const KATEGORI_MAP = {
  "kategori:spartel-forbehandling":  "Spartel & forbehandling",
  "kategori:vaeg-loft":              "Væg & loft",
  "kategori:trae-metal":             "Træ & metal",
  "kategori:traebeskyttelse-olie":   "Træbeskyttelse & olie",
  "kategori:mur-facade-tag":         "Mur, facade & tag",
  "kategori:vaegbeklaedning":        "Vægbeklædning",
  "kategori:rens":                   "Rens",
  "kategori:epoxy":                  "Epoxy",
};

const LARS_FREY_VENDOR = "Lars Frey Farve og Lak";

function computeProductType(p) {
  const tagSet = new Set(p.tags);

  // 1. Specialblanding wins over paint-type (products carry both tags)
  if (tagSet.has("specialblanding")) return "Specialblanding";

  // 2. Main paint line
  for (const [tag, type] of Object.entries(PAINT_TYPE_MAP)) {
    if (tagSet.has(tag)) return type;
  }

  // 3. Sortiment kategori
  for (const [tag, type] of Object.entries(KATEGORI_MAP)) {
    if (tagSet.has(tag)) return type;
  }

  // 4. Lars Frey catch-all
  if (p.vendor === LARS_FREY_VENDOR) return "Tilbehør";

  return null;
}

// ─── GraphQL ────────────────────────────────────────────────────────

const GET_PRODUCTS = `
  query GetProducts($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title vendor tags productType }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id productType }
      userErrors { field message }
    }
  }
`;

// ─── Main ───────────────────────────────────────────────────────────

console.log(`\nSet productType on all products`);
if (DRY_RUN) console.log(`DRY RUN — no changes will be made`);
console.log();

let cursor = null;
const plan = [];
const unmapped = [];
const tally = new Map();

// Pass 1: fetch everything and compute desired types
do {
  const data = await shopifyGraphQL(GET_PRODUCTS, { cursor });
  for (const p of data.products.nodes) {
    const desired = computeProductType(p);
    if (desired === null) {
      unmapped.push(p);
      continue;
    }
    if (p.productType === desired) continue; // idempotent
    plan.push({ id: p.id, title: p.title, current: p.productType || "(empty)", desired });
    tally.set(desired, (tally.get(desired) ?? 0) + 1);
  }
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  if (cursor) await sleep(200);
} while (cursor);

console.log(`Planned updates: ${plan.length}`);
console.log(`Unmapped:        ${unmapped.length}`);
console.log();

console.log(`productType distribution for updates:`);
for (const [t, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${t}`);
}

if (unmapped.length > 0) {
  console.log(`\nUnmapped products (no rule matched — will be skipped):`);
  for (const p of unmapped.slice(0, 20)) {
    console.log(`  - ${p.title}  [vendor: ${p.vendor}]  tags: ${p.tags.slice(0, 5).join(", ")}${p.tags.length > 5 ? ", …" : ""}`);
  }
  if (unmapped.length > 20) console.log(`  … +${unmapped.length - 20} more`);
}

if (plan.length === 0) {
  console.log(`\nNothing to update.`);
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`\nSample (first 5):`);
  for (const u of plan.slice(0, 5)) {
    console.log(`  ${u.title.padEnd(40)} ${u.current}  →  ${u.desired}`);
  }
  console.log(`\nDRY RUN — no writes.`);
  process.exit(0);
}

// Pass 2: apply
let updated = 0;
let failed = 0;

for (const u of plan) {
  try {
    const result = await shopifyGraphQL(UPDATE_PRODUCT, {
      product: { id: u.id, productType: u.desired },
    });
    const errors = result.productUpdate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${u.title} — ${errors[0].message}`);
      failed++;
    } else {
      updated++;
    }
  } catch (err) {
    console.log(`  ✗ ${u.title} — ${err.message}`);
    failed++;
  }
  await sleep(150);
}

console.log(`\n--- Summary ---`);
console.log(`Updated: ${updated}`);
console.log(`Failed:  ${failed}`);
if (failed > 0) process.exit(1);
