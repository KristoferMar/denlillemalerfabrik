#!/usr/bin/env node
/**
 * Downloads product images from pronelli.com (via CSV mapping)
 * and uploads them to matching Shopify products.
 *
 * Each Shopify product gets ONE image — from the first matching CSV row.
 *
 * Usage:
 *   node upload-product-images.js --dry-run    Preview mapping
 *   node upload-product-images.js              Upload images
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const IMAGES_DIR = resolve(__dirname, "../../docs/products/images");

// ─── Parse CSV mapping ───────────────────────────────────────────────

function parseCSV() {
  const raw = readFileSync(
    resolve("/Users/kristofermar/Downloads/pronelli_produkt_billeder_MAPPING.csv"),
    "utf-8"
  );

  const rows = [];
  const lines = raw.split("\n").slice(1); // skip header

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse CSV with quoted fields
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    if (fields.length < 6) continue;

    const [varenummer, varenavn, kategori, varianter, billedfil, billedUrl] = fields;

    // Clean the varenummer — strip -K suffix to get base SKU
    const baseSku = varenummer.replace(/-K$/, "");

    rows.push({
      baseSku,
      varenavn,
      kategori,
      billedUrl,
      billedfil,
    });
  }

  return rows;
}

// ─── Build SKU → image URL lookup ────────────────────────────────────

function buildSkuToImageMap(csvRows) {
  const map = new Map();

  for (const row of csvRows) {
    if (!row.billedUrl || !row.billedUrl.startsWith("http")) continue;

    // The CSV baseSku might match our product SKUs in various ways:
    // CSV: "292ECO/50F1" → Shopify SKU: "52-292ECO/50F1"
    // CSV: "417915" → Shopify SKU: "417915"
    // CSV: "52-TINGO/20F1" → Shopify SKU: "52-TINGO/20F1"
    // Also handle slash/dash differences: CSV uses / but filenames use -
    const variants = [
      row.baseSku,
      `52-${row.baseSku}`,
    ];

    for (const sku of variants) {
      if (!map.has(sku)) {
        map.set(sku, row.billedUrl);
      }
    }
  }

  return map;
}

// ─── Fetch all Shopify products with variant SKUs ────────────────────

const LIST_PRODUCTS = `
  query ListProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "vendor:'Lars Frey Farve og Lak'") {
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            sku
          }
        }
        images(first: 1) {
          nodes {
            id
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

async function fetchAllProducts() {
  const products = [];
  let cursor = null;

  while (true) {
    const data = await shopifyGraphQL(LIST_PRODUCTS, { cursor });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(300);
  }

  return products;
}

// ─── Download image to local file ────────────────────────────────────

async function downloadImage(url, filename) {
  const filepath = resolve(IMAGES_DIR, filename);
  if (existsSync(filepath)) return filepath;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buffer);
  return filepath;
}

// ─── Upload image to Shopify via staged upload ───────────────────────

const STAGED_UPLOAD = `
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_PRODUCT_IMAGE = `
  mutation CreateProductImage($productId: ID!, $image: CreateMediaInput!) {
    productCreateMedia(productId: $productId, media: [$image]) {
      media {
        ... on MediaImage {
          id
          image {
            url
          }
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

async function uploadImageToShopify(productId, localPath, filename) {
  const fileData = readFileSync(localPath);
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

  // Step 1: Get staged upload URL
  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [
      {
        resource: "IMAGE",
        filename,
        mimeType,
        fileSize: String(fileData.length),
        httpMethod: "POST",
      },
    ],
  });

  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length > 0) {
    throw new Error(`Staged upload error: ${errors[0].message}`);
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0];

  // Step 2: Upload file to staged URL
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", new Blob([fileData], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  // Step 3: Attach to product
  const result = await shopifyGraphQL(CREATE_PRODUCT_IMAGE, {
    productId,
    image: {
      originalSource: target.resourceUrl,
      mediaContentType: "IMAGE",
    },
  });

  const mediaErrors = result.productCreateMedia.mediaUserErrors;
  if (mediaErrors.length > 0) {
    throw new Error(`Media error: ${mediaErrors[0].message}`);
  }

  return true;
}

// ─── Main ────────────────────────────────────────────────────────────

// Ensure images directory exists
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}

console.log("Parsing CSV mapping...");
const csvRows = parseCSV();
console.log(`  ${csvRows.length} entries in CSV\n`);

const skuImageMap = buildSkuToImageMap(csvRows);

console.log("Fetching Shopify products...");
const products = await fetchAllProducts();
console.log(`  ${products.length} products found\n`);

// Match each product to an image via its first variant SKU
let matched = 0;
let noMatch = 0;
let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const product of products) {
  // Skip products that already have an image
  if (product.images.nodes.length > 0) {
    console.log(`  → ${product.title} — already has image, skipping`);
    skipped++;
    continue;
  }

  // Try to find image URL by checking each variant's SKU
  let imageUrl = null;
  for (const variant of product.variants.nodes) {
    if (!variant.sku) continue;
    if (skuImageMap.has(variant.sku)) {
      imageUrl = skuImageMap.get(variant.sku);
      break;
    }
  }

  if (!imageUrl) {
    console.log(`  ⚠ ${product.title} — no image match found`);
    noMatch++;
    continue;
  }

  matched++;

  if (DRY_RUN) {
    console.log(`  📷 ${product.title} → ${imageUrl}`);
    continue;
  }

  // Download and upload
  try {
    const ext = imageUrl.split(".").pop().split("?")[0] || "jpg";
    const safeTitle = product.title.replace(/[^a-zA-Z0-9æøåÆØÅ-]/g, "_").toLowerCase();
    const filename = `${safeTitle}.${ext}`;

    await downloadImage(imageUrl, filename);
    await uploadImageToShopify(product.id, resolve(IMAGES_DIR, filename), filename);
    console.log(`  ✓ ${product.title}`);
    uploaded++;
  } catch (err) {
    console.log(`  ✗ ${product.title} — ${err.message}`);
    failed++;
  }

  await sleep(1000);
}

console.log(`\n--- Summary ---`);
if (DRY_RUN) {
  console.log(`Matched: ${matched}, No match: ${noMatch}, Already has image: ${skipped}`);
  console.log("Run without --dry-run to upload.");
} else {
  console.log(`Uploaded: ${uploaded}, Skipped: ${skipped}, No match: ${noMatch}, Failed: ${failed}`);
}
