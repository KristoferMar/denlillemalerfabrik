#!/usr/bin/env node
/**
 * Creates all DLM paint products in Shopify.
 *
 * - 32 Vægmaling products (all colors)
 * - 5 sample products (one per remaining paint type, Snehvid only)
 * - Each product gets 3 variants: 5L, 10L, 20L
 * - Shared product image: images/products/test-product.png
 * - Structured tags for bulk operations
 *
 * Usage:
 *   node create-paint-products.js --dry-run     Preview what will be created
 *   node create-paint-products.js               Create all products
 *   node create-paint-products.js --skip-images  Create without uploading images
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_IMAGES = process.argv.includes("--skip-images");

// ─── Color data (from docs/colors.md) ───────────────────────────────

const COLORS = [
  // 01 — Whites
  { code: "DLM0101", name: "Snehvid",    hex: "#FAFAFA", family: "whites",         familyCode: "01" },
  { code: "DLM0102", name: "Porcelæn",   hex: "#F5F0EB", family: "whites",         familyCode: "01" },
  { code: "DLM0103", name: "Kalkhvid",   hex: "#EDE8E0", family: "whites",         familyCode: "01" },
  { code: "DLM0104", name: "Cremehvid",  hex: "#F5EDD6", family: "whites",         familyCode: "01" },
  // 02 — Blues
  { code: "DLM0201", name: "Isklar",     hex: "#E4EEF2", family: "blues",          familyCode: "02" },
  { code: "DLM0202", name: "Himmellys",  hex: "#C8DBE4", family: "blues",          familyCode: "02" },
  { code: "DLM0203", name: "Havbrise",   hex: "#A3C1CE", family: "blues",          familyCode: "02" },
  { code: "DLM0204", name: "Dybhav",     hex: "#5B8FA3", family: "blues",          familyCode: "02" },
  // 03 — Greys
  { code: "DLM0301", name: "Sølvtåge",   hex: "#D6D8D6", family: "greys",          familyCode: "03" },
  { code: "DLM0302", name: "Drivsten",   hex: "#B8B5AE", family: "greys",          familyCode: "03" },
  { code: "DLM0303", name: "Granitgrå",  hex: "#908D86", family: "greys",          familyCode: "03" },
  { code: "DLM0304", name: "Skifergrå",  hex: "#6B6B6B", family: "greys",          familyCode: "03" },
  // 04 — Greens
  { code: "DLM0401", name: "Morgendug",  hex: "#E2EBE0", family: "greens",         familyCode: "04" },
  { code: "DLM0402", name: "Mynte",      hex: "#C5D9C2", family: "greens",         familyCode: "04" },
  { code: "DLM0403", name: "Salvie",     hex: "#A3B5A0", family: "greens",         familyCode: "04" },
  { code: "DLM0404", name: "Skovdybde",  hex: "#6B7F68", family: "greens",         familyCode: "04" },
  // 05 — Warm Neutrals
  { code: "DLM0501", name: "Elfenben",   hex: "#F2EBE0", family: "warm-neutrals",  familyCode: "05" },
  { code: "DLM0502", name: "Havremel",   hex: "#E8DCC8", family: "warm-neutrals",  familyCode: "05" },
  { code: "DLM0503", name: "Nougat",     hex: "#CDBA9E", family: "warm-neutrals",  familyCode: "05" },
  { code: "DLM0504", name: "Valnød",     hex: "#8B7355", family: "warm-neutrals",  familyCode: "05" },
  // 06 — Yellows / Sands
  { code: "DLM0601", name: "Strandlys",  hex: "#F0E8D8", family: "yellows-sands",  familyCode: "06" },
  { code: "DLM0602", name: "Klitsand",   hex: "#DDD0B5", family: "yellows-sands",  familyCode: "06" },
  { code: "DLM0603", name: "Ravgul",     hex: "#C8A84E", family: "yellows-sands",  familyCode: "06" },
  { code: "DLM0604", name: "Karamel",    hex: "#A67B4B", family: "yellows-sands",  familyCode: "06" },
  // 07 — Pinks / Coppers
  { code: "DLM0701", name: "Rosendug",   hex: "#F0DDD8", family: "pinks-coppers",  familyCode: "07" },
  { code: "DLM0702", name: "Solnedgang", hex: "#E0A890", family: "pinks-coppers",  familyCode: "07" },
  { code: "DLM0703", name: "Kobber",     hex: "#B87548", family: "pinks-coppers",  familyCode: "07" },
  { code: "DLM0704", name: "Terracotta", hex: "#C06840", family: "pinks-coppers",  familyCode: "07" },
  // 08 — Reds / Browns
  { code: "DLM0801", name: "Rødler",     hex: "#B85C42", family: "reds-browns",    familyCode: "08" },
  { code: "DLM0802", name: "Murstensrød",hex: "#9B4332", family: "reds-browns",    familyCode: "08" },
  { code: "DLM0803", name: "Kastanje",   hex: "#6E3428", family: "reds-browns",    familyCode: "08" },
  { code: "DLM0804", name: "Mørk Jord",  hex: "#4A2820", family: "reds-browns",    familyCode: "08" },
];

// ─── Paint types ────────────────────────────────────────────────────

const PAINT_TYPES = [
  { prefix: "10", name: "Vægmaling",      tag: "vaegmaling",      fullColors: true,  prices: { "5L": "299", "10L": "499", "20L": "899" } },
  { prefix: "20", name: "Loftmaling",     tag: "loftmaling",      fullColors: false, prices: { "5L": "279", "10L": "469", "20L": "849" } },
  { prefix: "30", name: "Træ & Metal",    tag: "trae-og-metal",   fullColors: false, prices: { "5L": "329", "10L": "549", "20L": "979" } },
  { prefix: "40", name: "Strukturmaling", tag: "strukturmaling",  fullColors: false, prices: { "5L": "349", "10L": "579", "20L": "1029" } },
  { prefix: "50", name: "Træbeskyttelse", tag: "traebeskyttelse", fullColors: false, prices: { "5L": "359", "10L": "599", "20L": "1049" } },
  { prefix: "60", name: "Gulvmaling",     tag: "gulvmaling",      fullColors: false, prices: { "5L": "369", "10L": "619", "20L": "1099" } },
];

const SNEHVID = COLORS[0]; // DLM0101

// ─── Build product list ─────────────────────────────────────────────

function buildProductList() {
  const products = [];

  for (const paintType of PAINT_TYPES) {
    const colors = paintType.fullColors ? COLORS : [SNEHVID];

    for (const color of colors) {
      const fullCode = `DLM${paintType.prefix}-${color.code.slice(3)}`;

      products.push({
        title: `${paintType.name} — ${color.name}`,
        paintType,
        color,
        fullCode,
        tags: [
          "paint",
          `paint-type:${paintType.tag}`,
          `paint-type-prefix:${paintType.prefix}`,
          `color-family:${color.family}`,
          `color-code:${color.code}`,
          `full-code:${fullCode}`,
        ],
        variants: [
          { size: "5L",  price: paintType.prices["5L"],  sku: `${fullCode}-5L` },
          { size: "10L", price: paintType.prices["10L"], sku: `${fullCode}-10L` },
          { size: "20L", price: paintType.prices["20L"], sku: `${fullCode}-20L` },
        ],
      });
    }
  }

  return products;
}

// ─── GraphQL mutations ──────────────────────────────────────────────

const CREATE_PRODUCT = `
  mutation CreateProduct($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
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

const DELETE_VARIANTS = `
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      userErrors { field message }
    }
  }
`;

const GET_DEFAULT_VARIANT = `
  query GetDefaultVariant($productId: ID!) {
    product(id: $productId) {
      variants(first: 1) {
        nodes { id }
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

const CREATE_PRODUCT_IMAGE = `
  mutation CreateProductImage($productId: ID!, $image: CreateMediaInput!) {
    productCreateMedia(productId: $productId, media: [$image]) {
      media {
        ... on MediaImage { id }
      }
      mediaUserErrors { field message }
    }
  }
`;

const GET_VARIANT_INVENTORY = `
  query GetVariantInventory($productId: ID!) {
    product(id: $productId) {
      variants(first: 10) {
        nodes {
          id
          inventoryItem {
            id
            inventoryLevels(first: 1) {
              nodes {
                location { id }
              }
            }
          }
        }
      }
    }
  }
`;

const SET_INVENTORY = `
  mutation SetInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

// ─── Image upload helper ────────────────────────────────────────────

const IMAGE_PATH = resolve(__dirname, "../../images/products/test-product.png");

async function uploadProductImage(productId) {
  if (!existsSync(IMAGE_PATH)) {
    console.log(`  ⚠ Image not found: ${IMAGE_PATH}`);
    return;
  }

  const fileData = readFileSync(IMAGE_PATH);
  const filename = "test-product.png";
  const mimeType = "image/png";

  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [{
      resource: "IMAGE",
      filename,
      mimeType,
      fileSize: String(fileData.length),
      httpMethod: "POST",
    }],
  });

  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length > 0) {
    throw new Error(`Staged upload error: ${errors[0].message}`);
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", new Blob([fileData], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: formData });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  await shopifyGraphQL(CREATE_PRODUCT_IMAGE, {
    productId,
    image: { originalSource: target.resourceUrl, mediaContentType: "IMAGE" },
  });
}

// ─── Main ───────────────────────────────────────────────────────────

const products = buildProductList();

console.log(`\n🎨 DLM Paint Product Creator`);
console.log(`   ${products.length} products to create\n`);

if (DRY_RUN) {
  console.log("DRY RUN — listing all products:\n");
  for (const p of products) {
    console.log(`  ${p.title}`);
    console.log(`    Tags: ${p.tags.join(", ")}`);
    for (const v of p.variants) {
      console.log(`    ${v.size}  ${v.price} kr  SKU: ${v.sku}`);
    }
    console.log();
  }
  console.log(`Total: ${products.length} products, ${products.length * 3} variants`);
  process.exit(0);
}

// Check image exists before starting
if (!SKIP_IMAGES && !existsSync(IMAGE_PATH)) {
  console.error(`Image not found: ${IMAGE_PATH}`);
  console.error("Use --skip-images to create products without images.");
  process.exit(1);
}

let created = 0;
let failed = 0;

for (const p of products) {
  try {
    console.log(`Creating: ${p.title}...`);

    // Step 1: Create product
    const result = await shopifyGraphQL(CREATE_PRODUCT, {
      product: {
        title: p.title,
        tags: p.tags,
        vendor: "Den Lille Malerfabrik",
        status: "ACTIVE",
        productOptions: [{ name: "Størrelse", values: [{ name: "Default" }] }],
      },
    });

    const errors = result.productCreate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${errors.map((e) => e.message).join(", ")}`);
      failed++;
      continue;
    }

    const productId = result.productCreate.product.id;
    await sleep(300);

    // Step 2: Get default variant to delete later
    const defaultVarResult = await shopifyGraphQL(GET_DEFAULT_VARIANT, { productId });
    const defaultVariantId = defaultVarResult.product.variants.nodes[0]?.id;
    await sleep(300);

    // Step 3: Add real variants (5L, 10L, 20L)
    const varResult = await shopifyGraphQL(CREATE_VARIANTS, {
      productId,
      variants: p.variants.map((v) => ({
        inventoryItem: { sku: v.sku },
        optionValues: [{ optionName: "Størrelse", name: v.size }],
        price: v.price,
      })),
    });

    const varErrors = varResult.productVariantsBulkCreate.userErrors;
    if (varErrors.length > 0) {
      console.log(`  ⚠ Variant errors: ${varErrors.map((e) => e.message).join(", ")}`);
    }
    await sleep(300);

    // Step 4: Delete default variant
    if (defaultVariantId) {
      await shopifyGraphQL(DELETE_VARIANTS, {
        productId,
        variantsIds: [defaultVariantId],
      });
      await sleep(300);
    }

    // Step 5: Set inventory to 10 for each variant
    try {
      const invData = await shopifyGraphQL(GET_VARIANT_INVENTORY, { productId });
      const variants = invData.product.variants.nodes;
      for (const variant of variants) {
        const locationId = variant.inventoryItem.inventoryLevels.nodes[0]?.location?.id;
        if (!locationId) {
          console.log(`  ⚠ No location found for variant, skipping inventory`);
          continue;
        }
        await shopifyGraphQL(SET_INVENTORY, {
          input: {
            reason: "correction",
            name: "available",
            quantities: [{
              inventoryItemId: variant.inventoryItem.id,
              locationId,
              quantity: 10,
            }],
          },
        });
        await sleep(300);
      }
    } catch (err) {
      console.log(`  ⚠ Inventory error: ${err.message}`);
    }

    // Step 6: Upload image
    if (!SKIP_IMAGES) {
      try {
        await uploadProductImage(productId);
      } catch (err) {
        console.log(`  ⚠ Image upload failed: ${err.message}`);
      }
      await sleep(500);
    }

    console.log(`  ✓ Created (${p.variants.length} variants)`);
    created++;
  } catch (err) {
    console.log(`  ✗ ${p.title} — ${err.message}`);
    failed++;
  }

  await sleep(500);
}

console.log(`\n--- Summary ---`);
console.log(`Created: ${created}`);
console.log(`Failed:  ${failed}`);
console.log(`Total:   ${products.length}`);

if (created > 0) {
  console.log(`\nRemember to publish products to Online Store if needed.`);
  console.log(`Use: node publish-to-online-store.js`);
}
