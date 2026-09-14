#!/usr/bin/env node
/**
 * Converts a sortiment product (sizes only, no colours, no image) into a
 * paint-line product: Farve (217 colours) × Størrelse, price-list prices,
 * paint tags and production bucket photography.
 *
 * Existing variants and the handle/URL are kept: each existing size variant
 * becomes Råhvid / {size}. Missing sizes and the other colours are created.
 *
 * Pricing follows the 2 Sept 2026 rule (malingspriser-vs-prisliste xlsx,
 * fanen Forudsætninger): Råhvid = the price list's "Lys Råhvid" / Base A line,
 * the other 216 colours = the Base C line. Prices below are "Vejl.
 * udsalgspris" from DLM_fuld_prisliste_alle_produkter.numbers.
 *
 * Usage:
 *   node scripts/products/convert-sortiment-to-paint.js <config> --dry-run
 *   node scripts/products/convert-sortiment-to-paint.js <config>
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const DRY_RUN = process.argv.includes("--dry-run");

const CONFIGS = {
  // Applied 2026-09-14. Tinting was removed again the same day
  // (remove-traebeskyttelse-vandbaseret-colors.js) — don't re-run.
  "traebeskyttelse-vandbaseret": {
    handle: "traebeskyttelse-heldaekkende-vandig",
    title: "Træbeskyttelse Vandbaseret",
    productType: "Træbeskyttelse",
    // No glans on the bucket: no glans:* tag, SKU uses VB instead of G{glans}.
    tags: ["paint", "paint-type:traebeskyttelse", "paint-type-prefix:50"],
    skuPattern: (code, size) => `DLM50-${code}-VB-${size}`,
    // Price list #60–63
    prices: {
      "5L": { raahvid: "749.00", tinted: "899.00" },
      "10L": { raahvid: "1599.00", tinted: "1699.00" },
    },
    images: [
      { file: "traebeskyttelse-vandbaseret-5l-front.png", alt: "dlm-production-v2-5l", linkSize: "5L" },
      { file: "traebeskyttelse-vandbaseret-5l-back.png", alt: "dlm-production-v2-5l-back", linkSize: null },
    ],
  },

  "bad-koekken-glans-25": {
    handle: "vaegmaling-kokken-bad-glans-25",
    title: "Bad & Køkken Glans 25",
    productType: "Vægmaling",
    tags: ["paint", "paint-type:vaegmaling", "paint-type-prefix:10", "glans:25"],
    skuPattern: (code, size) => `DLM10-${code}-G25-${size}`,
    // Price list #24–31. Base C sizes are 0,8 / 2,6 / 4,8 / 9,7 L, treated as
    // 1 / 3 / 5 / 10 L like the other wall paints. Note the list has tinted
    // 1 L (249) cheaper than Råhvid 1 L (299) — copied as-is.
    prices: {
      "1L": { raahvid: "299.00", tinted: "249.00" },
      "3L": { raahvid: "599.00", tinted: "649.00" },
      "5L": { raahvid: "799.00", tinted: "849.00" },
      "10L": { raahvid: "1499.00", tinted: "1549.00" },
    },
    images: [
      { file: "bad-og-koekken-glans-25-10l-front.png", alt: "dlm-production-v2-10l", linkSize: "10L" },
      { file: "bad-og-koekken-glans-25-10l-back.png", alt: "dlm-production-v2-10l-back", linkSize: null },
    ],
  },
};

const CONFIG_NAME = process.argv.slice(2).find((a) => !a.startsWith("--"));
const cfg = CONFIGS[CONFIG_NAME];
if (!cfg) {
  console.error(`Usage: node convert-sortiment-to-paint.js <${Object.keys(CONFIGS).join("|")}> [--dry-run]`);
  process.exit(1);
}

const BASE_COLOR = "Råhvid";
const SIZES = Object.keys(cfg.prices);
const IMAGE_DIR = resolve(REPO_ROOT, "images/products/paint-types-production");
const COLORS = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "docs/colors/dlm-colors-with-ncs.json"), "utf-8")
).sort((a, b) => (a.dlm_id < b.dlm_id ? -1 : 1));

const priceFor = (color, size) => cfg.prices[size][color === BASE_COLOR ? "raahvid" : "tinted"];
const skuFor = (color, size) =>
  cfg.skuPattern(COLORS.find((c) => c.name_da === color).dlm_id.slice(3), size);
// "3 L" → "3L", matching the paint line's size values.
const normalizeSize = (s) => s.replace(/\s+/g, "");

// ─── GraphQL ───────────────────────────────────────────────────────────────

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id title handle productType tags
      options { id name optionValues { id name } }
      variants(first: 250) { nodes { id title price selectedOptions { name value } } }
    }
  }
`;

const GET_VARIANTS_PAGE = `
  query GetVariants($id: ID!, $cursor: String) {
    product(id: $id) {
      variants(first: 250, after: $cursor) {
        nodes { id selectedOptions { name value } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const CREATE_OPTIONS = `
  mutation CreateOptions($productId: ID!, $options: [OptionCreateInput!]!) {
    productOptionsCreate(productId: $productId, options: $options) {
      userErrors { field message code }
    }
  }
`;

const UPDATE_OPTION = `
  mutation UpdateOption(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToAdd: [OptionValueCreateInput!]
    $optionValuesToUpdate: [OptionValueUpdateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToAdd: $optionValuesToAdd
      optionValuesToUpdate: $optionValuesToUpdate
    ) {
      userErrors { field message code }
    }
  }
`;

const UPDATE_VARIANTS = `
  mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message code }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      userErrors { field message }
    }
  }
`;

const STAGED_UPLOAD = `
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `
  mutation CreateProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id } }
      mediaUserErrors { field message }
    }
  }
`;

const MEDIA_STATUS = `
  query MediaStatus($id: ID!) {
    node(id: $id) { ... on MediaImage { status fileErrors { message } } }
  }
`;

const APPEND_VARIANT_MEDIA = `
  mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
    productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
      userErrors { field message }
    }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertNoErrors(label, errors) {
  if (errors && errors.length) {
    throw new Error(`${label}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

async function fetchProduct() {
  const { productByHandle } = await shopifyGraphQL(GET_PRODUCT, { handle: cfg.handle });
  if (!productByHandle) throw new Error(`No product with handle "${cfg.handle}"`);
  return productByHandle;
}

async function uploadImage(productId, file, alt) {
  const buffer = readFileSync(resolve(IMAGE_DIR, file));
  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [{
      resource: "IMAGE",
      filename: basename(file),
      mimeType: "image/png",
      fileSize: String(buffer.length),
      httpMethod: "POST",
    }],
  });
  assertNoErrors("Staged upload", staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), basename(file));
  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok && res.status !== 201) throw new Error(`Upload failed: ${res.status}`);

  const created = await shopifyGraphQL(CREATE_MEDIA, {
    productId,
    media: [{ originalSource: target.resourceUrl, mediaContentType: "IMAGE", alt }],
  });
  assertNoErrors("Attach media", created.productCreateMedia.mediaUserErrors);
  return created.productCreateMedia.media[0].id;
}

// Shopify processes images asynchronously; variants can't be linked until READY.
async function waitForMediaReady(mediaId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { node } = await shopifyGraphQL(MEDIA_STATUS, { id: mediaId });
    if (node?.status === "READY") return;
    if (node?.status === "FAILED") throw new Error(`Media failed: ${node.fileErrors?.[0]?.message}`);
    await sleep(2000);
  }
  throw new Error(`Media ${mediaId} not READY after ${timeoutMs / 1000}s`);
}

// ─── Plan ──────────────────────────────────────────────────────────────────

let product = await fetchProduct();
console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Converting ${product.title} (${product.handle})\n`);

const sizeOption = product.options.find((o) => o.name === "Størrelse");
if (product.options.length !== 1 || !sizeOption) {
  console.error(
    `Expected an untouched sortiment product with only a Størrelse option; found options ` +
      `${product.options.map((o) => o.name).join(", ")}. Aborting so a partial run isn't applied twice.`
  );
  process.exit(1);
}

const existing = product.variants.nodes.map((v) => ({
  id: v.id,
  oldSize: v.selectedOptions[0].value,
  size: normalizeSize(v.selectedOptions[0].value),
  oldPrice: v.price,
}));
const unknownSize = existing.find((v) => !SIZES.includes(v.size));
if (unknownSize) {
  console.error(`Existing size "${unknownSize.oldSize}" has no price in the config — aborting.`);
  process.exit(1);
}

const existingSizes = new Set(existing.map((v) => v.size));
const sizesToAdd = SIZES.filter((s) => !existingSizes.has(s));
const newVariants = [];
for (const color of COLORS) {
  for (const size of SIZES) {
    if (color.name_da === BASE_COLOR && existingSizes.has(size)) continue;
    newVariants.push({ color: color.name_da, size, price: priceFor(color.name_da, size), sku: skuFor(color.name_da, size) });
  }
}
const newTags = [...new Set([...product.tags, ...cfg.tags])];

console.log(`Title:        ${product.title}  →  ${cfg.title}`);
console.log(`Product type: ${product.productType}  →  ${cfg.productType}`);
console.log(`Tags:         + ${cfg.tags.join(", ")}  (existing tags kept)`);
console.log(`Options:      Størrelse [${sizeOption.optionValues.map((v) => v.name).join(", ")}]  →  Farve (${COLORS.length}) × Størrelse [${SIZES.join(", ")}]`);
console.log(`Existing variants → ${BASE_COLOR}, inventory untracked:`);
for (const v of existing) {
  console.log(`  ${v.oldSize.padEnd(5)} ${v.oldPrice.padStart(8)}  →  ${v.size.padEnd(4)} ${priceFor(BASE_COLOR, v.size).padStart(8)}  ${skuFor(BASE_COLOR, v.size)}`);
}
console.log(`New variants: ${newVariants.length}  (total ${newVariants.length + existing.length})`);
console.log(`Prices:`);
for (const size of SIZES) {
  console.log(`  ${size.padEnd(4)} ${BASE_COLOR} ${cfg.prices[size].raahvid.padStart(8)}   øvrige farver ${cfg.prices[size].tinted.padStart(8)}`);
}
console.log(`Images:`);
for (const img of cfg.images) {
  console.log(`  ${img.file}  alt=${img.alt}${img.linkSize ? `  → linked to ${COLORS.length} × ${img.linkSize} variants` : ""}`);
}

if (DRY_RUN) {
  console.log("\nDRY RUN — nothing changed.");
  process.exit(0);
}

// ─── Apply ─────────────────────────────────────────────────────────────────

const productId = product.id;

console.log(`\n1. Adding Farve option (existing variants become ${BASE_COLOR})…`);
let res = await shopifyGraphQL(CREATE_OPTIONS, {
  productId,
  options: [{ name: "Farve", position: 1, values: [{ name: BASE_COLOR }] }],
});
assertNoErrors("productOptionsCreate", res.productOptionsCreate.userErrors);

console.log(`2. Size values: normalise${sizesToAdd.length ? `, + ${sizesToAdd.join(", ")}` : ""}…`);
res = await shopifyGraphQL(UPDATE_OPTION, {
  productId,
  option: { id: sizeOption.id },
  optionValuesToUpdate: sizeOption.optionValues
    .filter((ov) => ov.name !== normalizeSize(ov.name))
    .map((ov) => ({ id: ov.id, name: normalizeSize(ov.name) })),
  optionValuesToAdd: sizesToAdd.map((name) => ({ name })),
});
assertNoErrors("productOptionUpdate (Størrelse)", res.productOptionUpdate.userErrors);

product = await fetchProduct();
const farveOption = product.options.find((o) => o.name === "Farve");
const otherColors = COLORS.map((c) => c.name_da).filter((n) => n !== BASE_COLOR);
console.log(`3. Adding ${otherColors.length} colour values…`);
for (let i = 0; i < otherColors.length; i += 100) {
  res = await shopifyGraphQL(UPDATE_OPTION, {
    productId,
    option: { id: farveOption.id },
    optionValuesToAdd: otherColors.slice(i, i + 100).map((name) => ({ name })),
  });
  assertNoErrors("productOptionUpdate (Farve)", res.productOptionUpdate.userErrors);
  await sleep(300);
}

console.log(`4. Updating ${existing.length} existing variants…`);
res = await shopifyGraphQL(UPDATE_VARIANTS, {
  productId,
  variants: existing.map((v) => ({
    id: v.id,
    price: priceFor(BASE_COLOR, v.size),
    inventoryPolicy: "CONTINUE",
    inventoryItem: { sku: skuFor(BASE_COLOR, v.size), tracked: false },
  })),
});
assertNoErrors("productVariantsBulkUpdate", res.productVariantsBulkUpdate.userErrors);

console.log(`5. Creating ${newVariants.length} variants…`);
let created = 0;
for (let i = 0; i < newVariants.length; i += 200) {
  const batch = newVariants.slice(i, i + 200);
  res = await shopifyGraphQL(CREATE_VARIANTS, {
    productId,
    variants: batch.map((v) => ({
      optionValues: [
        { optionName: "Farve", name: v.color },
        { optionName: "Størrelse", name: v.size },
      ],
      price: v.price,
      inventoryPolicy: "CONTINUE",
      inventoryItem: { sku: v.sku, tracked: false },
    })),
  });
  assertNoErrors("productVariantsBulkCreate", res.productVariantsBulkCreate.userErrors);
  created += res.productVariantsBulkCreate.productVariants.length;
  console.log(`   ✓ ${created}/${newVariants.length}`);
  await sleep(500);
}

console.log("6. Title, product type and tags…");
res = await shopifyGraphQL(UPDATE_PRODUCT, {
  product: { id: productId, title: cfg.title, productType: cfg.productType, tags: newTags },
});
assertNoErrors("productUpdate", res.productUpdate.userErrors);

console.log("7. Images…");
for (const img of cfg.images) {
  const mediaId = await uploadImage(productId, img.file, img.alt);
  await waitForMediaReady(mediaId);
  console.log(`   ✓ ${img.file}`);
  if (!img.linkSize) continue;

  const variantIds = [];
  let cursor = null;
  do {
    const data = await shopifyGraphQL(GET_VARIANTS_PAGE, { id: productId, cursor });
    const page = data.product.variants;
    for (const v of page.nodes) {
      if (v.selectedOptions.some((o) => o.name === "Størrelse" && o.value === img.linkSize)) variantIds.push(v.id);
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  for (let i = 0; i < variantIds.length; i += 100) {
    res = await shopifyGraphQL(APPEND_VARIANT_MEDIA, {
      productId,
      variantMedia: variantIds.slice(i, i + 100).map((variantId) => ({ variantId, mediaIds: [mediaId] })),
    });
    assertNoErrors("productVariantAppendMedia", res.productVariantAppendMedia.userErrors);
    await sleep(600);
  }
  console.log(`   ✓ linked to ${variantIds.length} × ${img.linkSize} variants`);
}

console.log(`\nDone — ${cfg.title}: ${created + existing.length} variants, ${cfg.images.length} images.`);
