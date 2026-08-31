#!/usr/bin/env node
/**
 * Exports every product and every variant with its price to JSON, for the
 * price-list workbook in docs/products/.
 *
 * Unlike export-all-products.js (which writes Markdown and caps variants at
 * 100 per product) this paginates variants, so the 868-variant paint products
 * come through complete. See docs/products/prisliste.md.
 *
 * Usage:
 *   node scripts/products/export-price-list.js
 *   node scripts/products/export-price-list.js --out path/to/file.json
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL, getScriptArgs, sleep } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const args = getScriptArgs();
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 && args[outIdx + 1]
  ? resolve(process.cwd(), args[outIdx + 1])
  : resolve(PROJECT_ROOT, "docs/products/price-list.json");

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle status vendor productType tags totalInventory
        createdAt updatedAt
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variantsCount { count }
        options(first: 5) { name }
      }
    }
  }
`;

const VARIANTS = `
  query Variants($id: ID!, $cursor: String) {
    product(id: $id) {
      variants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title sku price compareAtPrice
          availableForSale inventoryQuantity
          selectedOptions { name value }
        }
      }
    }
  }
`;

async function allProducts() {
  const out = []; let cursor = null;
  do {
    const d = await shopifyGraphQL(PRODUCTS, { cursor });
    out.push(...d.products.nodes);
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    if (cursor) await sleep(250);
  } while (cursor);
  return out;
}

async function allVariants(productId) {
  const out = []; let cursor = null;
  do {
    const d = await shopifyGraphQL(VARIANTS, { id: productId, cursor });
    const page = d.product.variants;
    out.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (cursor) await sleep(200);
  } while (cursor);
  return out;
}

const products = await allProducts();
console.log(`Fetched ${products.length} products; pulling variants…`);

let done = 0, totalVariants = 0;
const rows = [];
for (const p of products) {
  const variants = await allVariants(p.id);
  totalVariants += variants.length;
  rows.push({
    id: Number(p.id.split("/").pop()),
    title: p.title, handle: p.handle, status: p.status,
    vendor: p.vendor, productType: p.productType,
    tags: p.tags, totalInventory: p.totalInventory,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    optionNames: p.options.map((o) => o.name),
    declaredVariantCount: p.variantsCount.count,
    minPrice: Number(p.priceRangeV2.minVariantPrice.amount),
    maxPrice: Number(p.priceRangeV2.maxVariantPrice.amount),
    currency: p.priceRangeV2.minVariantPrice.currencyCode,
    variants: variants.map((v) => ({
      id: Number(v.id.split("/").pop()),
      title: v.title, sku: v.sku,
      price: v.price === null ? null : Number(v.price),
      compareAtPrice: v.compareAtPrice === null ? null : Number(v.compareAtPrice),
      available: v.availableForSale,
      inventoryQuantity: v.inventoryQuantity,
      options: Object.fromEntries(v.selectedOptions.map((o) => [o.name, o.value])),
    })),
  });
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${products.length} products, ${totalVariants} variants`);
  await sleep(120);
}

writeFileSync(outPath, JSON.stringify({
  exportedAt: new Date().toISOString(),
  productCount: rows.length,
  variantCount: totalVariants,
  products: rows,
}, null, 1), "utf-8");
console.log(`\nWrote ${rows.length} products / ${totalVariants} variants to ${outPath}`);
