#!/usr/bin/env node
/**
 * Uploads size-variant paint-bucket PNGs from images/products/processed/
 * and links each to the matching size variants on Shopify.
 *
 * Filename convention:
 *   - `{handle}-{size}.png`          → variant image for matching Størrelse
 *   - `{handle}.png`                 → featured image (handled separately)
 *   - `strukturmaling.png` or `strukturmaling-{size}.png` → handle remap to `strukturmaling-glans-5`
 *
 * What this script does:
 *   1. Scans for `{handle}-{size}.png` files (skips no-size files)
 *   2. For each: finds the product, uploads the image as product media,
 *      then attaches the media to every variant whose "Størrelse" option
 *      matches the size (e.g., all 32 color × 5L variants of Vægmaling Glans 5)
 *
 * Idempotent: uses alt="dlm-baked-{size}" on media as a marker, skips if present.
 *
 * Usage:
 *   node scripts/products/link-paint-size-variant-images.js --dry-run
 *   node scripts/products/link-paint-size-variant-images.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = resolve(__dirname, "../../images/products/processed");
const DRY_RUN = process.argv.includes("--dry-run");

const HANDLE_REMAP = {
  strukturmaling: "strukturmaling-glans-5",
};

// ─── GraphQL ────────────────────────────────────────────────

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      media(first: 100) {
        nodes {
          id
          alt
          mediaContentType
        }
      }
      variants(first: 250) {
        nodes {
          id
          title
          selectedOptions { name value }
          media(first: 5) { nodes { id } }
        }
      }
    }
  }
`;

const STAGED_UPLOAD = `
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `
  mutation CreateProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id alt status } }
      mediaUserErrors { field message }
    }
  }
`;

const APPEND_VARIANT_MEDIA = `
  mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
    productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
      userErrors { field message }
    }
  }
`;

// ─── Helpers ────────────────────────────────────────────────

function parseFilename(filename) {
  const stem = basename(filename, extname(filename));
  // Match trailing `-{digit}l` or similar (e.g., -5l, -10l, -20l, -3l, -2_5l)
  const m = stem.match(/^(.+)-(\d+(?:[_.]\d+)?l)$/i);
  if (m) {
    const rawHandle = m[1];
    const sizeLower = m[2].toLowerCase();
    const handle = HANDLE_REMAP[rawHandle] || rawHandle;
    // "5l" → "5L", "10l" → "10L"
    const size = sizeLower.toUpperCase();
    return { handle, size };
  }
  // No size suffix
  const handle = HANDLE_REMAP[stem] || stem;
  return { handle, size: null };
}

async function uploadImageBytes(fileBuffer, filename) {
  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [
      {
        resource: "IMAGE",
        filename,
        mimeType: "image/png",
        fileSize: String(fileBuffer.length),
        httpMethod: "POST",
      },
    ],
  });
  const errs = staged.stagedUploadsCreate.userErrors;
  if (errs.length > 0) throw new Error(`Staged upload: ${errs[0].message}`);

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([fileBuffer], { type: "image/png" }), filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }
  return target.resourceUrl;
}

async function attachMedia(productId, resourceUrl, alt) {
  const result = await shopifyGraphQL(CREATE_MEDIA, {
    productId,
    media: [{ originalSource: resourceUrl, mediaContentType: "IMAGE", alt }],
  });
  const errs = result.productCreateMedia.mediaUserErrors;
  if (errs.length > 0) throw new Error(`Attach: ${errs[0].message}`);
  return result.productCreateMedia.media[0];
}

async function linkVariantsToMedia(productId, variantIds, mediaId) {
  if (variantIds.length === 0) return;
  // productVariantAppendMedia takes a list of {variantId, mediaIds}
  const variantMedia = variantIds.map((id) => ({
    variantId: id,
    mediaIds: [mediaId],
  }));

  // Batch — API accepts up to ~250, we have at most 32 per size
  const result = await shopifyGraphQL(APPEND_VARIANT_MEDIA, {
    productId,
    variantMedia,
  });
  const errs = result.productVariantAppendMedia.userErrors;
  if (errs.length > 0) throw new Error(`Link variants: ${errs[0].message}`);
}

// ─── Main ────────────────────────────────────────────────

console.log(`Link paint-bucket size variant images`);
console.log(`  source: ${PROCESSED_DIR}`);
if (DRY_RUN) console.log(`  DRY RUN — no writes`);
console.log();

const files = readdirSync(PROCESSED_DIR)
  .filter((f) => /\.png$/i.test(f))
  .sort();

// Group by handle for display + only keep size-specific files
const sizeFiles = [];
for (const f of files) {
  const parsed = parseFilename(f);
  if (parsed.size) sizeFiles.push({ file: f, ...parsed });
}

console.log(`Found ${sizeFiles.length} size-specific files (out of ${files.length} total):\n`);

let uploaded = 0;
let linked = 0;
let skippedExisting = 0;
let notFound = 0;
let sizeMismatch = 0;
let failed = 0;

// Cache product lookups — many files share a handle
const productCache = new Map();

for (const entry of sizeFiles) {
  const { file, handle, size } = entry;
  const altTag = `dlm-baked-${size.toLowerCase()}`;
  console.log(`→ ${file}  →  ${handle} / size=${size}`);

  try {
    // Fetch product (cached)
    let product = productCache.get(handle);
    if (!product) {
      const data = await shopifyGraphQL(GET_PRODUCT, { handle });
      product = data.productByHandle;
      if (product) productCache.set(handle, product);
    }

    if (!product) {
      console.log(`  ✗ No product with handle "${handle}"`);
      notFound++;
      continue;
    }
    console.log(`    product: ${product.title}`);

    // Find variants whose Størrelse equals this size
    const matchingVariants = product.variants.nodes.filter((v) =>
      v.selectedOptions.some(
        (o) => o.name.toLowerCase() === "størrelse" && o.value.toUpperCase() === size
      )
    );

    if (matchingVariants.length === 0) {
      console.log(`    ⚠ No variants with Størrelse="${size}" — product has sizes: ${[...new Set(product.variants.nodes.flatMap(v => v.selectedOptions.filter(o => o.name.toLowerCase() === "størrelse").map(o => o.value)))].join(", ")}`);
      sizeMismatch++;
      continue;
    }
    console.log(`    ${matchingVariants.length} matching variants`);

    // Check if this size's image is already uploaded (idempotency)
    const existingMedia = product.media.nodes.find((m) => m.alt === altTag);
    if (existingMedia) {
      console.log(`    (media already uploaded — alt="${altTag}")`);
      // Still try to link variants that aren't linked yet
      const unlinkedVariants = matchingVariants.filter(
        (v) => !v.media.nodes.some((m) => m.id === existingMedia.id)
      );
      if (unlinkedVariants.length === 0) {
        skippedExisting++;
        continue;
      }
      console.log(`    linking ${unlinkedVariants.length} variants that didn't have the image yet`);
      if (DRY_RUN) {
        linked += unlinkedVariants.length;
        continue;
      }
      await linkVariantsToMedia(product.id, unlinkedVariants.map((v) => v.id), existingMedia.id);
      linked += unlinkedVariants.length;
      await sleep(800);
      continue;
    }

    if (DRY_RUN) {
      console.log(`    would upload ${file} and link to ${matchingVariants.length} variants`);
      uploaded++;
      linked += matchingVariants.length;
      continue;
    }

    // Upload + attach media
    const filePath = join(PROCESSED_DIR, file);
    const fileBuffer = readFileSync(filePath);
    const resourceUrl = await uploadImageBytes(fileBuffer, file);
    const media = await attachMedia(product.id, resourceUrl, altTag);
    uploaded++;
    console.log(`    ✓ uploaded (media ${media.id})`);

    // Media needs a moment to process before we can link it to variants
    await sleep(2000);

    await linkVariantsToMedia(
      product.id,
      matchingVariants.map((v) => v.id),
      media.id
    );
    linked += matchingVariants.length;
    console.log(`    ✓ linked to ${matchingVariants.length} variants`);

    // Invalidate cache for this product so next file sees updated state
    productCache.delete(handle);
  } catch (err) {
    console.log(`    ✗ ${err.message}`);
    failed++;
  }

  await sleep(800);
}

console.log(`\n--- Summary ---`);
console.log(`Images uploaded:  ${uploaded}`);
console.log(`Variants linked:  ${linked}`);
console.log(`Skipped (done):   ${skippedExisting}`);
console.log(`Product not found:${notFound}`);
console.log(`Size mismatch:    ${sizeMismatch}`);
console.log(`Failed:           ${failed}`);
if (failed > 0) process.exit(1);
