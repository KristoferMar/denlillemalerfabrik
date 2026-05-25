#!/usr/bin/env node
/**
 * Build the static variant map consumed by the product-finder configurator.
 *
 * The configurator looks up `(handle, color, size) → {variant_id, available,
 * price}` to fill the right-hand summary panel and the "Læg malingen i kurv"
 * button. Originally that map was emitted by the Liquid section, but with
 * 200+ colors × 4 sizes per product (= 800+ variants) we hit two hard caps:
 *
 *   1. Liquid's `product.variants` truncates to the first 250 variants when
 *      the product is fetched via `all_products[handle]` from a section.
 *   2. The storefront Ajax endpoint `/products/{handle}.js` is also capped
 *      at 250 — same problem, different surface.
 *
 * Both caps mean colors past family 06 (Søblå area) silently 404 in the UI.
 *
 * This script bypasses both by going through the Admin API (no cap), paging
 * through every variant, and writing the full map to:
 *
 *     assets/configurator-variant-map.json
 *
 * The theme JS loads that file on page load and uses it as the source of
 * truth. Re-run this script whenever you add/remove variants on the
 * configurator products.
 *
 * Usage:
 *   node scripts/products/build-configurator-variant-map.js
 */

import { shopifyGraphQL } from "../shopify-client.js";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keep in sync with CFG_SURFACES in assets/kmeconsulting-product-finder.js
const CFG_HANDLES = [
  "vaegmaling-glans-5",
  "vaegmaling-glans-10",
  "loftmaling-glans-5",
  "trae-metal-glans-40",
  "traebeskyttelse-glans-20",
];

// Currency formatter for the price string the configurator displays.
// Matches the Danish format ("499,00 kr") emitted by Shopify's `money` filter
// on this store. Adjust if the store's money_format ever changes.
const moneyFmt = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 2,
});

const PRODUCT_QUERY = `
  query Product($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      options(first: 5) { name position }
    }
  }
`;

const VARIANTS_QUERY = `
  query Variants($productId: ID!, $cursor: String) {
    product(id: $productId) {
      variants(first: 250, after: $cursor) {
        nodes {
          id
          price
          availableForSale
          selectedOptions { name value }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

async function fetchAllVariants(productId) {
  const out = [];
  let cursor = null;
  do {
    const data = await shopifyGraphQL(VARIANTS_QUERY, { productId, cursor });
    const page = data.product.variants;
    out.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

console.log(`Building configurator variant map for ${CFG_HANDLES.length} products\n`);

const allVariants = [];
const productsMeta = {};

for (const handle of CFG_HANDLES) {
  const headerData = await shopifyGraphQL(PRODUCT_QUERY, { handle });
  const product = headerData.productByHandle;
  if (!product) {
    console.warn(`  ${handle}: not found, skipping`);
    continue;
  }

  productsMeta[handle] = { title: product.title };

  const variants = await fetchAllVariants(product.id);
  let emitted = 0;
  for (const v of variants) {
    const opts = Object.fromEntries(
      v.selectedOptions.map((o) => [o.name, o.value])
    );
    const color = opts["Farve"];
    const size = opts["Størrelse"];
    if (!color || !size) continue;
    allVariants.push({
      handle,
      color,
      size,
      variant_id: Number(v.id.split("/").pop()),
      available: v.availableForSale,
      price: moneyFmt.format(Number(v.price)),
    });
    emitted++;
  }

  console.log(`  ${handle.padEnd(28)} ${variants.length} variants, ${emitted} emitted`);
}

const outPath = resolve(
  __dirname,
  "../../assets/configurator-variant-map.json"
);
writeFileSync(
  outPath,
  JSON.stringify(
    { products: productsMeta, variants: allVariants },
    null,
    0
  )
);

console.log(
  `\nWrote ${allVariants.length} variants to assets/configurator-variant-map.json`
);
