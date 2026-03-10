#!/usr/bin/env node
/**
 * Links product images to their matching variants based on SKU in the filename.
 *
 * For each product, matches image filenames to variant SKUs and assigns
 * the image to the variant so the theme can toggle images on variant selection.
 *
 * Usage:
 *   node link-variant-images.js --dry-run    Preview
 *   node link-variant-images.js              Link images
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Fetch all products with media and variants ──────────────────────

const LIST_PRODUCTS = `
  query ListProducts($cursor: String) {
    products(first: 20, after: $cursor, query: "vendor:'Lars Frey Farve og Lak'") {
      nodes {
        id
        title
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            image {
              url
            }
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

const UPDATE_VARIANT = `
  mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Normalize SKU for matching against filenames ────────────────────

function normalizeSku(sku) {
  // "52-292ECO/50F1" → "52-292eco-50f1"
  return sku.toLowerCase().replace(/\//g, "-");
}

function getFilenameFromUrl(url) {
  // Extract filename from Shopify CDN URL
  const parts = url.split("/");
  const last = parts[parts.length - 1].split("?")[0];
  return last.toLowerCase();
}

// ─── Main ────────────────────────────────────────────────────────────

console.log("Fetching products...\n");

const products = [];
let cursor = null;

while (true) {
  const data = await shopifyGraphQL(LIST_PRODUCTS, { cursor });
  products.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
  await sleep(300);
}

let totalLinked = 0;
let totalSkipped = 0;

for (const product of products) {
  const media = product.media.nodes.filter((m) => m.image);
  const variants = product.variants.nodes;

  // Skip products with 0 or 1 images (no point in linking)
  if (media.length <= 1) {
    continue;
  }

  // Skip products where all variants already have images
  const unlinked = variants.filter((v) => !v.image);
  if (unlinked.length === 0) {
    continue;
  }

  const updates = [];

  for (const variant of variants) {
    if (variant.image) continue; // already linked
    if (!variant.sku) continue;

    const normalizedSku = normalizeSku(variant.sku);

    // Find matching image by checking if filename contains the SKU
    const match = media.find((m) => {
      const filename = getFilenameFromUrl(m.image.url);
      return filename.includes(normalizedSku);
    });

    if (match) {
      updates.push({
        variantId: variant.id,
        variantSku: variant.sku,
        mediaId: match.id,
        filename: getFilenameFromUrl(match.image.url),
      });
    }
  }

  if (updates.length === 0) continue;

  if (DRY_RUN) {
    console.log(`📦 ${product.title}`);
    for (const u of updates) {
      console.log(`    ${u.variantSku} → ${u.filename}`);
    }
    totalLinked += updates.length;
    continue;
  }

  // Update variants with their matched images
  try {
    const result = await shopifyGraphQL(UPDATE_VARIANT, {
      productId: product.id,
      variants: updates.map((u) => ({
        id: u.variantId,
        mediaId: u.mediaId,
      })),
    });

    const errors = result.productVariantsBulkUpdate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${product.title} — ${errors[0].message}`);
      totalSkipped += updates.length;
    } else {
      console.log(`  ✓ ${product.title} — ${updates.length} variants linked`);
      totalLinked += updates.length;
    }
  } catch (err) {
    console.log(`  ✗ ${product.title} — ${err.message}`);
    totalSkipped += updates.length;
  }

  await sleep(500);
}

console.log(`\n${DRY_RUN ? "DRY RUN — would link" : "Linked"}: ${totalLinked} variants, Skipped: ${totalSkipped}`);
