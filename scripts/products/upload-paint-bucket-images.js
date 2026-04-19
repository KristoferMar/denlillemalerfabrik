#!/usr/bin/env node
/**
 * Uploads the baked paint-bucket PNGs from images/products/processed/
 * to their matching Shopify products and sets each as the featured
 * (first) image.
 *
 * Filename → product handle:
 *   - `{handle}.png` matches product by handle exactly
 *   - `strukturmaling.png` → `strukturmaling-glans-5` (consolidated handle)
 *
 * Idempotent-ish: won't re-upload if a media item with the exact same
 * alt text already exists on the product.
 *
 * Usage:
 *   node scripts/products/upload-paint-bucket-images.js --dry-run
 *   node scripts/products/upload-paint-bucket-images.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = resolve(__dirname, "../../images/products/processed");
const DRY_RUN = process.argv.includes("--dry-run");

// Special filename → handle remaps
const HANDLE_REMAP = {
  strukturmaling: "strukturmaling-glans-5",
};

const ALT_TAG = "dlm-baked-bucket"; // marker so we can detect prior uploads

// ─── GraphQL ─────────────────────────────────────────────────────

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      media(first: 50) {
        nodes {
          id
          alt
          mediaContentType
          ... on MediaImage {
            image { url }
          }
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
      media {
        ... on MediaImage { id alt image { url } }
      }
      mediaUserErrors { field message }
    }
  }
`;

const REORDER_MEDIA = `
  mutation ReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      userErrors { field message }
    }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────

function handleFromFilename(filename) {
  const stem = basename(filename, extname(filename));
  return HANDLE_REMAP[stem] || stem;
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
    media: [
      {
        originalSource: resourceUrl,
        mediaContentType: "IMAGE",
        alt,
      },
    ],
  });
  const errs = result.productCreateMedia.mediaUserErrors;
  if (errs.length > 0) throw new Error(`Attach: ${errs[0].message}`);
  return result.productCreateMedia.media[0];
}

async function moveMediaFirst(productId, mediaId) {
  // Place the new media at position 0 — becomes the featured image.
  const result = await shopifyGraphQL(REORDER_MEDIA, {
    id: productId,
    moves: [{ id: mediaId, newPosition: "0" }],
  });
  const errs = result.productReorderMedia.userErrors;
  if (errs.length > 0) throw new Error(`Reorder: ${errs[0].message}`);
}

// ─── Main ────────────────────────────────────────────────────────

console.log(`Upload paint bucket images`);
console.log(`  source: ${PROCESSED_DIR}`);
if (DRY_RUN) console.log(`  DRY RUN — no writes`);
console.log();

if (!statSync(PROCESSED_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Processed directory not found: ${PROCESSED_DIR}`);
  process.exit(1);
}

const files = readdirSync(PROCESSED_DIR)
  .filter((f) => /\.png$/i.test(f))
  .sort();

console.log(`Found ${files.length} PNGs to process:\n`);

let uploaded = 0;
let skippedExisting = 0;
let notFound = 0;
let failed = 0;

for (const file of files) {
  const handle = handleFromFilename(file);
  console.log(`→ ${file}  →  ${handle}`);

  try {
    const data = await shopifyGraphQL(GET_PRODUCT, { handle });
    const product = data.productByHandle;
    if (!product) {
      console.log(`  ✗ No product with handle "${handle}"`);
      notFound++;
      continue;
    }
    console.log(`    product: ${product.title} (${product.id})`);

    const already = product.media.nodes.find((m) => m.alt === ALT_TAG);
    if (already) {
      console.log(`    (already uploaded — alt="${ALT_TAG}" present)`);
      skippedExisting++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`    would upload ${file} and set as featured`);
      uploaded++;
      continue;
    }

    const filePath = join(PROCESSED_DIR, file);
    const fileBuffer = readFileSync(filePath);

    const resourceUrl = await uploadImageBytes(fileBuffer, file);
    const media = await attachMedia(product.id, resourceUrl, ALT_TAG);

    // Wait a moment for media to be processed before reordering
    await sleep(1500);
    await moveMediaFirst(product.id, media.id);

    console.log(`    ✓ uploaded and set as featured`);
    uploaded++;
  } catch (err) {
    console.log(`    ✗ ${err.message}`);
    failed++;
  }

  await sleep(800);
}

console.log(`\n--- Summary ---`);
console.log(`Uploaded:          ${uploaded}`);
console.log(`Skipped (existed): ${skippedExisting}`);
console.log(`Product not found: ${notFound}`);
console.log(`Failed:            ${failed}`);
if (failed > 0) process.exit(1);
