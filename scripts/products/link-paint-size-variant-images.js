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
const REPO_ROOT = resolve(__dirname, "../..");
const DRY_RUN = process.argv.includes("--dry-run");

function flagValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

// --dir  : source folder, relative to repo root (default: the baked renders)
// --only : only process files whose name contains this substring
// --alt-prefix : marker written to media.alt, used for idempotency
const SOURCE_DIR = resolve(REPO_ROOT, flagValue("--dir", "images/products/processed"));
const ONLY = flagValue("--only", null);
const ALT_PREFIX = flagValue("--alt-prefix", "dlm-baked");

const HANDLE_REMAP = {
  strukturmaling: "strukturmaling-glans-5",
};

// Production bucket photography does not follow the {handle}-{size} convention,
// so map those filenames explicitly. Stem (no extension) -> { handle, size },
// or an ARRAY of those when one photo serves more than one product.
//
// The glans 5 bucket is printed "VÆG & LOFT", i.e. it is physically the same
// tin sold under two products, so each of its size shots is linked to both
// Vægmaling Glans 5 and Loftmaling Glans 5. Shopify media is per-product, so
// the file is uploaded once per product — that is expected, not a duplicate.
const FILE_MAP = {
  "vaeg-og-loft-glans-5-1l-front": [
    { handle: "vaegmaling-glans-5", size: "1L" },
    { handle: "loftmaling-glans-5", size: "1L" },
  ],
  "vaeg-og-loft-glans-5-3l-front": [
    { handle: "vaegmaling-glans-5", size: "3L" },
    { handle: "loftmaling-glans-5", size: "3L" },
  ],
  "vaeg-og-loft-glans-5-5l-front": [
    { handle: "vaegmaling-glans-5", size: "5L" },
    { handle: "loftmaling-glans-5", size: "5L" },
  ],
  "vaeg-og-loft-glans-5-10l-front": [
    { handle: "vaegmaling-glans-5", size: "10L" },
    { handle: "loftmaling-glans-5", size: "10L" },
  ],
  "loft-glans-1-1l-front":  { handle: "loftmaling-glans-1", size: "1L" },
  "loft-glans-1-3l-front":  { handle: "loftmaling-glans-1", size: "3L" },
  "loft-glans-1-5l-front":  { handle: "loftmaling-glans-1", size: "5L" },
  // The 10L is also the product's featured image, which is what the lone
  // 12L Råhvid variant falls back to (no 12L artwork exists).
  "loft-glans-1-10l-front": { handle: "loftmaling-glans-1", size: "10L" },
  // Træbeskyttelse: the buckets are branded by base (OLIEBASERET), the Shopify
  // products by gloss (Glans 10/20/40). Confirmed 2026-08-30 that only the
  // oil-based formula is produced, so the oliebaseret artwork belongs on the
  // gloss product the configurator uses. If the catalogue is ever restructured
  // by base rather than gloss, these handles are what change.
  "traebeskyttelse-oliebaseret-1l-front":  { handle: "traebeskyttelse-glans-20", size: "1L" },
  "traebeskyttelse-oliebaseret-3l-front":  { handle: "traebeskyttelse-glans-20", size: "3L" },
  "traebeskyttelse-oliebaseret-5l-front":  { handle: "traebeskyttelse-glans-20", size: "5L" },
  "traebeskyttelse-oliebaseret-10l-front": { handle: "traebeskyttelse-glans-20", size: "10L" },
  // Note the product handle is `trae-metal-glans-40` (no "og"), while the
  // artwork filenames spell it out — hence the explicit mapping.
  "trae-og-metal-glans-40-1l-front":  { handle: "trae-metal-glans-40", size: "1L" },
  "trae-og-metal-glans-40-3l-front":  { handle: "trae-metal-glans-40", size: "3L" },
  "trae-og-metal-glans-40-5l-front":  { handle: "trae-metal-glans-40", size: "5L" },
  "trae-og-metal-glans-40-10l-front": { handle: "trae-metal-glans-40", size: "10L" },
  "vaeg-glans-10-1l-front":  { handle: "vaegmaling-glans-10", size: "1L" },
  "vaeg-glans-10-3l-front":  { handle: "vaegmaling-glans-10", size: "3L" },
  "vaeg-glans-10-5l-front":  { handle: "vaegmaling-glans-10", size: "5L" },
  "vaeg-glans-10-10l-front": { handle: "vaegmaling-glans-10", size: "10L" },
};

// ─── GraphQL ────────────────────────────────────────────────

const GET_PRODUCT = `
  query GetProduct($handle: String!, $cursor: String) {
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
      variants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
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

const MEDIA_STATUS = `
  query MediaStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage { id status fileStatus fileErrors { code details message } }
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

// Returns an ARRAY of { handle, size } targets for one file — a photo may
// serve several products (see FILE_MAP).
function parseTargets(filename) {
  const stem = basename(filename, extname(filename));
  const mapped = FILE_MAP[stem];
  if (mapped) {
    return (Array.isArray(mapped) ? mapped : [mapped]).map((t) => ({ ...t }));
  }
  return [parseFilename(filename)];
}

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

/**
 * Fetch a product and ALL of its variants.
 * The API caps variants at 250 per page; products in the paint line have 868
 * (217 colors x 4 sizes), so a single unpaginated page silently covers a
 * fraction of them. Walk every page before matching on size.
 */
async function fetchProductAllVariants(handle) {
  let cursor = null;
  let product = null;
  const variants = [];
  do {
    const data = await shopifyGraphQL(GET_PRODUCT, { handle, cursor });
    const page = data.productByHandle;
    if (!page) return null;
    if (!product) product = { id: page.id, title: page.title, handle: page.handle, media: page.media };
    variants.push(...page.variants.nodes);
    cursor = page.variants.pageInfo.hasNextPage ? page.variants.pageInfo.endCursor : null;
    if (cursor) await sleep(300);
  } while (cursor);
  return { ...product, variants: { nodes: variants } };
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

/**
 * Shopify processes uploaded images asynchronously. Attaching media to variants
 * before it finishes fails with "Non-ready media cannot be attached to variants",
 * and how long it takes scales with file size — a fixed sleep is not enough for
 * multi-MB production photography. Poll until READY instead.
 */
async function waitForMediaReady(mediaId, { timeoutMs = 120000, intervalMs = 2000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await shopifyGraphQL(MEDIA_STATUS, { id: mediaId });
    const status = data.node?.fileStatus || data.node?.status;
    if (status === "READY") return;
    if (status === "FAILED") {
      const err = data.node?.fileErrors?.[0];
      throw new Error(`Media processing failed: ${err ? err.message : "unknown"}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Media ${mediaId} not READY after ${timeoutMs / 1000}s`);
}

async function linkVariantsToMedia(productId, variantIds, mediaId) {
  if (variantIds.length === 0) return;
  // productVariantAppendMedia takes a list of {variantId, mediaIds}
  const variantMedia = variantIds.map((id) => ({
    variantId: id,
    mediaIds: [mediaId],
  }));

  // A size can now cover 200+ variants, so chunk rather than sending one call.
  const CHUNK = 100;
  for (let i = 0; i < variantMedia.length; i += CHUNK) {
    const slice = variantMedia.slice(i, i + CHUNK);
    const result = await shopifyGraphQL(APPEND_VARIANT_MEDIA, {
      productId,
      variantMedia: slice,
    });
    const errs = result.productVariantAppendMedia.userErrors;
    if (errs.length > 0) throw new Error(`Link variants: ${errs[0].message}`);
    if (i + CHUNK < variantMedia.length) await sleep(600);
  }
}

// ─── Main ────────────────────────────────────────────────

console.log(`Link paint-bucket size variant images`);
console.log(`  source:     ${SOURCE_DIR}`);
console.log(`  alt prefix: ${ALT_PREFIX}`);
if (ONLY) console.log(`  filter:     files containing "${ONLY}"`);
if (DRY_RUN) console.log(`  DRY RUN — no writes`);
console.log();

const files = readdirSync(SOURCE_DIR)
  .filter((f) => /\.png$/i.test(f))
  .filter((f) => (ONLY ? f.includes(ONLY) : true))
  .sort();

// Group by handle for display + only keep size-specific files
const sizeFiles = [];
for (const f of files) {
  for (const target of parseTargets(f)) {
    if (target.size) sizeFiles.push({ file: f, ...target });
  }
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
  const altTag = `${ALT_PREFIX}-${size.toLowerCase()}`;
  console.log(`→ ${file}  →  ${handle} / size=${size}`);

  try {
    // Fetch product (cached)
    let product = productCache.get(handle);
    if (!product) {
      product = await fetchProductAllVariants(handle);
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
      await waitForMediaReady(existingMedia.id);
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
    const filePath = join(SOURCE_DIR, file);
    const fileBuffer = readFileSync(filePath);
    const resourceUrl = await uploadImageBytes(fileBuffer, file);
    const media = await attachMedia(product.id, resourceUrl, altTag);
    uploaded++;
    console.log(`    ✓ uploaded (media ${media.id})`);

    // Wait for Shopify to finish processing before linking to variants
    await waitForMediaReady(media.id);

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
