#!/usr/bin/env node
/**
 * Adds variants to existing products that were created without them.
 * Matches products by title to the catalog categories.
 *
 * Usage:
 *   node add-variants-to-existing.js --dry-run    Preview
 *   node add-variants-to-existing.js              Run
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Parse catalog (same as import script) ───────────────────────────

function parseCatalog() {
  const md = readFileSync(
    resolve(__dirname, "../../docs/products/products.md"),
    "utf-8"
  );

  const products = [];
  let current = null;

  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) products.push(current);
      current = { title: line.replace("## ", "").trim(), variants: [] };
      continue;
    }

    if (current && line.startsWith("|") && !line.startsWith("|---") && !line.includes("Varenummer")) {
      const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        const price = cols[2].replace(/\./g, "").replace(",", ".").trim();
        const numericPrice = parseFloat(price);
        current.variants.push({
          sku: cols[0],
          name: cols[1],
          price: isNaN(numericPrice) || numericPrice <= 0 ? null : Math.round(numericPrice * 1.5),
        });
      }
    }
  }

  if (current) products.push(current);
  return products;
}

// ─── Fetch all existing products ─────────────────────────────────────

const LIST_PRODUCTS = `
  query ListProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "vendor:'Lars Frey Farve og Lak'") {
      nodes {
        id
        title
        variants(first: 1) {
          nodes {
            id
            title
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_VARIANTS = `
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Main ────────────────────────────────────────────────────────────

const catalog = parseCatalog();
console.log(`Catalog: ${catalog.length} categories\n`);

// Fetch all products from Shopify
console.log("Fetching existing products...");
const shopProducts = [];
let cursor = null;

while (true) {
  const data = await shopifyGraphQL(LIST_PRODUCTS, { cursor });
  shopProducts.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
  await sleep(300);
}

console.log(`Found ${shopProducts.length} products in Shopify.\n`);

// Match catalog to Shopify products by title
let updated = 0;
let skipped = 0;

for (const cat of catalog) {
  const match = shopProducts.find((p) => p.title === cat.title);
  if (!match) {
    console.log(`  ⚠ No match for "${cat.title}"`);
    skipped++;
    continue;
  }

  // Check if it only has the default variant
  const hasOnlyDefault = match.variants.nodes.length === 1 &&
    match.variants.nodes[0].title === "Default";

  if (!hasOnlyDefault) {
    console.log(`  → "${cat.title}" already has variants, skipping`);
    skipped++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  📦 ${cat.title} — would add ${cat.variants.length} variants`);
    updated++;
    continue;
  }

  // Add variants in batches
  const BATCH_SIZE = 50;
  let variantsAdded = 0;

  for (let i = 0; i < cat.variants.length; i += BATCH_SIZE) {
    const batch = cat.variants.slice(i, i + BATCH_SIZE);
    try {
      const result = await shopifyGraphQL(CREATE_VARIANTS, {
        productId: match.id,
        variants: batch.map((v) => ({
          inventoryItem: { sku: v.sku },
          optionValues: [{ optionName: "Variant", name: v.name }],
          price: v.price ? String(v.price) : "0",
        })),
      });

      const errors = result.productVariantsBulkCreate.userErrors;
      if (errors.length > 0) {
        console.log(`    ⚠ ${cat.title}: ${errors.map((e) => e.message).join(", ")}`);
      } else {
        variantsAdded += batch.length;
      }
    } catch (err) {
      console.log(`    ✗ ${cat.title} batch error: ${err.message}`);
    }
    await sleep(300);
  }

  // Remove the default variant
  const defaultId = match.variants.nodes[0].id;
  try {
    await shopifyGraphQL(DELETE_VARIANTS, {
      productId: match.id,
      variantsIds: [defaultId],
    });
  } catch (err) {
    console.log(`    ⚠ Could not remove default variant: ${err.message}`);
  }

  console.log(`  ✓ ${cat.title} — ${variantsAdded} variants added`);
  updated++;
  await sleep(500);
}

if (DRY_RUN) {
  console.log(`\nDRY RUN — would update ${updated} products, ${skipped} skipped.`);
} else {
  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}
