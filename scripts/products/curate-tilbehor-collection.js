#!/usr/bin/env node
/**
 * Curates the `tilbehor` collection: ensures these 5 products exist as
 * the first members in this exact order. Drives the "Populære tilbehør"
 * shelf on the home page (templates/index.json → product_list_fa6P9H).
 *
 * Default mode: inspect — prints current collection state and a
 * proposed plan, no writes. Pass --apply to actually make changes.
 *
 * Add-only: products already in the collection are kept; we add the
 * targets if missing and reorder so the 5 targets are the first 5.
 * Other products stay (the section caps at max_products=5 so they
 * won't display anyway).
 *
 * Usage:
 *   node scripts/products/curate-tilbehor-collection.js          # inspect
 *   node scripts/products/curate-tilbehor-collection.js --apply  # write
 */

import { shopifyGraphQL } from "../shopify-client.js";

const COLLECTION_HANDLE = "tilbehor";

// Hand-curated order for the home-page shelf.
// Titles must match Shopify product titles exactly (including the " | category" suffix).
const TARGET_TITLES = [
  "Rullespand | Bakker",
  "Malebakke | Bakker",
  "Masking tape standard | Tape",
  "Glatlak rulle 18-25 cm | Ruller",
  "Håndtag 15-25 cm | Håndtag",
];

const APPLY = process.argv.includes("--apply");

// ─── 1. Find the collection ───────────────────────────────────────────

const colRes = await shopifyGraphQL(`
  query($h: String!) {
    collectionByHandle(handle: $h) {
      id
      title
      handle
      sortOrder
      ruleSet { rules { column condition relation } }
      productsCount { count }
    }
  }
`, { h: COLLECTION_HANDLE });

const collection = colRes.collectionByHandle;
if (!collection) {
  console.error(`✗ Collection with handle "${COLLECTION_HANDLE}" not found.`);
  process.exit(1);
}

const isSmartCollection = (collection.ruleSet?.rules?.length ?? 0) > 0;

console.log(`Collection: "${collection.title}" (${collection.handle})`);
console.log(`  id: ${collection.id}`);
console.log(`  type: ${isSmartCollection ? "smart (rule-based)" : "custom (manual)"}`);
console.log(`  sortOrder: ${collection.sortOrder}`);
console.log(`  total products: ${collection.productsCount.count}`);

// Paginate full membership so we don't false-positive a "missing" product.
const allMembers = [];
let cursor = null;
while (true) {
  const r = await shopifyGraphQL(`query($c:String){
    collectionByHandle(handle:"${COLLECTION_HANDLE}"){
      products(first:100, after:$c){
        pageInfo{ hasNextPage endCursor }
        nodes{ id handle title }
      }
    }
  }`, { c: cursor });
  allMembers.push(...r.collectionByHandle.products.nodes);
  if (!r.collectionByHandle.products.pageInfo.hasNextPage) break;
  cursor = r.collectionByHandle.products.pageInfo.endCursor;
}
console.log(`  fetched: ${allMembers.length} members\n`);

if (collection.sortOrder !== "MANUAL") {
  console.log(`⚠  sortOrder is "${collection.sortOrder}", must be MANUAL for custom ordering.`);
  console.log(`   ${APPLY ? "Will switch to MANUAL." : "Run with --apply to switch."}`);
}

// ─── 2. Resolve target products by title ──────────────────────────────

console.log(`\nResolving ${TARGET_TITLES.length} target products by title:`);

const targetProducts = [];
for (const title of TARGET_TITLES) {
  const r = await shopifyGraphQL(`
    query($q: String!) {
      products(first: 5, query: $q) {
        nodes { id title handle }
      }
    }
  `, { q: `title:"${title}"` });

  const matches = r.products.nodes;
  const exact = matches.filter((p) => p.title === title);
  const chosen = exact.length === 1 ? exact[0] : (matches.length === 1 ? matches[0] : null);

  if (!chosen) {
    console.log(`  ✗ "${title}" — ${matches.length} matches`);
    for (const m of matches) console.log(`      candidate: ${m.title}  (${m.handle})`);
    targetProducts.push(null);
  } else {
    console.log(`  ✓ "${title}" → ${chosen.title}  (${chosen.handle})`);
    targetProducts.push(chosen);
  }
}

const missing = targetProducts.filter((p) => p === null).length;
if (missing > 0) {
  console.error(`\n✗ ${missing} target product(s) could not be uniquely resolved. Aborting before any writes.`);
  process.exit(1);
}

// ─── 3. Diff against current collection ───────────────────────────────

const currentIds = new Set(allMembers.map((p) => p.id));
const toAdd = targetProducts.filter((p) => !currentIds.has(p.id));

console.log(`\nPlan:`);
if (collection.sortOrder !== "MANUAL") {
  console.log(`  • set sortOrder = MANUAL`);
}
if (toAdd.length > 0) {
  if (isSmartCollection) {
    console.error(`\n✗ Collection is smart/rule-based; cannot manually add products.`);
    console.error(`  Missing products would need to be added via collection rules or a separate manual collection:`);
    for (const p of toAdd) console.error(`      - ${p.title}  (${p.handle})`);
    process.exit(1);
  }
  console.log(`  • add ${toAdd.length} product(s) to collection:`);
  for (const p of toAdd) console.log(`      + ${p.title}`);
} else {
  console.log(`  • no products need to be added`);
}
console.log(`  • reorder so these 5 are positions 1–5:`);
for (let i = 0; i < targetProducts.length; i++) {
  console.log(`      ${i + 1}. ${targetProducts[i].title}`);
}

if (!APPLY) {
  console.log(`\n(dry-run — pass --apply to perform these changes)`);
  process.exit(0);
}

// ─── 4. Apply: switch to MANUAL if needed ─────────────────────────────

if (collection.sortOrder !== "MANUAL") {
  console.log(`\nSetting sortOrder to MANUAL...`);
  const r = await shopifyGraphQL(`
    mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id sortOrder }
        userErrors { field message }
      }
    }
  `, { input: { id: collection.id, sortOrder: "MANUAL" } });
  if (r.collectionUpdate.userErrors.length) {
    console.error("  ✗", r.collectionUpdate.userErrors);
    process.exit(1);
  }
  console.log(`  ✓ sortOrder = MANUAL`);
}

// ─── 5. Apply: add missing products (only for custom collections) ─────

if (toAdd.length > 0 && !isSmartCollection) {
  console.log(`\nAdding ${toAdd.length} product(s) to collection...`);
  const r = await shopifyGraphQL(`
    mutation($id: ID!, $productIds: [ID!]!) {
      collectionAddProductsV2(id: $id, productIds: $productIds) {
        job { id done }
        userErrors { field message }
      }
    }
  `, { id: collection.id, productIds: toAdd.map((p) => p.id) });
  if (r.collectionAddProductsV2.userErrors.length) {
    console.error("  ✗", r.collectionAddProductsV2.userErrors);
    process.exit(1);
  }
  console.log(`  ✓ add submitted (job ${r.collectionAddProductsV2.job.id}, done=${r.collectionAddProductsV2.job.done})`);
  // Brief wait for the async add to land before reorder.
  await new Promise((res) => setTimeout(res, 1500));
}

// ─── 6. Apply: reorder targets to positions 1..N ──────────────────────

console.log(`\nReordering targets to positions 1–${targetProducts.length}...`);
const moves = targetProducts.map((p, i) => ({ id: p.id, newPosition: String(i) }));
const r = await shopifyGraphQL(`
  mutation($id: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $id, moves: $moves) {
      job { id done }
      userErrors { field message }
    }
  }
`, { id: collection.id, moves });
if (r.collectionReorderProducts.userErrors.length) {
  console.error("  ✗", r.collectionReorderProducts.userErrors);
  process.exit(1);
}
console.log(`  ✓ reorder submitted (job ${r.collectionReorderProducts.job.id}, done=${r.collectionReorderProducts.job.done})`);

console.log(`\nDone. Verify in admin → Collections → Tilbehør.`);
