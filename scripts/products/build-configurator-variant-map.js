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
  "loftmaling-glans-1",
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
      # The configurator falls back to this when a variant has no image of
      # its own. The inline Liquid map also emits it, but only for handles
      # listed in cfg_handles — so emit it here too, otherwise a product the
      # Liquid missed has no fallback at all and the preview renders empty.
      featuredMedia {
        ... on MediaImage {
          image { url(transform: { maxWidth: 600 }) }
        }
      }
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
          # The configurator prefers a variant-specific bucket image and only
          # falls back to the product's featured image. Without this the
          # fallback fires for every variant — see syncProductPreview().
          media(first: 1) {
            nodes {
              ... on MediaImage {
                image { url(transform: { maxWidth: 600 }) }
              }
            }
          }
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
// "{handle}||{size}" -> bucket image URL
const imagesByHandleSize = {};

for (const handle of CFG_HANDLES) {
  const headerData = await shopifyGraphQL(PRODUCT_QUERY, { handle });
  const product = headerData.productByHandle;
  if (!product) {
    console.warn(`  ${handle}: not found, skipping`);
    continue;
  }

  const featured = product.featuredMedia?.image?.url || null;
  productsMeta[handle] = {
    title: product.title,
    ...(featured ? { image: featured } : {}),
  };
  if (!featured) {
    console.warn(`    ⚠ ${handle} has no featured image — variants without their own image will render an empty preview`);
  }

  const variants = await fetchAllVariants(product.id);
  let emitted = 0;
  let withImage = 0;
  for (const v of variants) {
    const opts = Object.fromEntries(
      v.selectedOptions.map((o) => [o.name, o.value])
    );
    const color = opts["Farve"];
    const size = opts["Størrelse"];
    if (!color || !size) continue;
    const variantImage = v.media?.nodes?.[0]?.image?.url || null;
    if (variantImage) {
      withImage++;
      // Every colour of a given handle+size shares one bucket photo, so the
      // URL is stored once per (handle, size) rather than on all ~217
      // variants. Repeating it per variant pushed this file from ~600 KB to
      // 1.1 MB, past the size the theme asset sync will carry — the stale
      // copy then silently wins because the section pins a versioned URL.
      const key = `${handle}||${size}`;
      if (!imagesByHandleSize[key]) imagesByHandleSize[key] = variantImage;
    }
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

  console.log(
    `  ${handle.padEnd(28)} ${variants.length} variants, ${emitted} emitted, ${withImage} with variant image`
  );
}

const outPath = resolve(
  __dirname,
  "../../assets/configurator-variant-map.json"
);
writeFileSync(
  outPath,
  JSON.stringify(
    { products: productsMeta, images: imagesByHandleSize, variants: allVariants },
    null,
    0
  )
);

console.log(
  `\nWrote ${allVariants.length} variants to assets/configurator-variant-map.json`
);
