#!/usr/bin/env node
/**
 * Creates a single product from a markdown file + local images.
 *
 * Usage:
 *   node add-single-product.js <path-to-md-file> [--dry-run]
 *
 * The MD file should contain:
 *   - # Title
 *   - ## Kategorier (tags)
 *   - ## Beskrivelse (bullet points → HTML description)
 *   - ## Varianter (table with Varenummer, Størrelse, Pris, Billedfil)
 *
 * Images are resolved relative to the MD file's directory.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const mdPath = process.argv.find((a) => a.endsWith(".md"));

if (!mdPath) {
  console.error("Usage: node add-single-product.js <path-to-md-file> [--dry-run]");
  process.exit(1);
}

const fullMdPath = resolve(mdPath);
const mdDir = dirname(fullMdPath);

// ─── Parse markdown ──────────────────────────────────────────────────

function parseProductMd(filepath) {
  const md = readFileSync(filepath, "utf-8");
  const lines = md.split("\n");

  let title = "";
  const tags = [];
  const descriptionLines = [];
  const variants = [];
  let currentSection = "";

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ") && !line.startsWith("### ")) {
      title = line.replace("# ", "").trim();
      continue;
    }

    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim().toLowerCase();
      continue;
    }

    if (line.startsWith("### ")) continue;

    if (currentSection === "kategorier" && line.startsWith("- ")) {
      tags.push(line.replace("- ", "").trim());
    }

    if (currentSection === "beskrivelse" && line.startsWith("- ")) {
      descriptionLines.push(line.replace("- ", "").trim());
    }

    if (currentSection === "varianter" && line.startsWith("|") && !line.startsWith("|---") && !line.includes("Varenummer")) {
      const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        const raw = cols[2].trim();
        // Handle both "1.317" (DK thousand sep) and "23.2" (decimal)
        // If it has a dot with 3 digits after, treat as thousand separator
        const normalized = raw.includes(",")
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw;
        const price = parseFloat(normalized);
        variants.push({
          sku: cols[0],
          size: cols[1],
          price: isNaN(price) || price <= 0 ? null : Math.round(price * 1.5),
          imageFile: cols[3] || null,
        });
      }
    }
  }

  // Build HTML description
  const descriptionHtml = descriptionLines.length > 0
    ? `<ul>${descriptionLines.map((d) => `<li>${d}</li>`).join("")}</ul>`
    : "";

  return { title, tags, descriptionHtml, variants };
}

// ─── Shopify mutations ───────────────────────────────────────────────

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

// ─── Upload image helper ─────────────────────────────────────────────

async function uploadImage(productId, localPath, filename) {
  const fileData = readFileSync(localPath);
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [{
      resource: "IMAGE",
      filename,
      mimeType,
      fileSize: String(fileData.length),
      httpMethod: "POST",
    }],
  });

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

// ─── Main ────────────────────────────────────────────────────────────

const product = parseProductMd(fullMdPath);

console.log(`Product: ${product.title}`);
console.log(`Tags: ${product.tags.join(", ")}`);
console.log(`Description: ${product.descriptionHtml.slice(0, 80)}...`);
console.log(`Variants: ${product.variants.length}`);
for (const v of product.variants) {
  const imgExists = v.imageFile ? existsSync(resolve(mdDir, v.imageFile)) : false;
  console.log(`  - ${v.sku}  ${v.size}  ${v.price} DKK  image: ${imgExists ? "✓" : "✗"}`);
}

if (DRY_RUN) {
  console.log("\nDRY RUN — nothing created.");
  process.exit(0);
}

// Step 1: Create product
console.log("\nCreating product...");
const result = await shopifyGraphQL(CREATE_PRODUCT, {
  product: {
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    tags: [...product.tags, "Lars Frey"],
    vendor: "Lars Frey Farve og Lak",
    status: "ACTIVE",
    productOptions: [{ name: "Størrelse", values: [{ name: "Default" }] }],
  },
});

const errors = result.productCreate.userErrors;
if (errors.length > 0) {
  console.error("Failed:", errors);
  process.exit(1);
}

const productId = result.productCreate.product.id;
console.log(`  ✓ Created: ${product.title} (${productId})`);

// Step 2: Get default variant to delete later
const defaultVarResult = await shopifyGraphQL(GET_DEFAULT_VARIANT, { productId });
const defaultVariantId = defaultVarResult.product.variants.nodes[0]?.id;
await sleep(300);

// Step 3: Add real variants
console.log("Adding variants...");
const varResult = await shopifyGraphQL(CREATE_VARIANTS, {
  productId,
  variants: product.variants.map((v) => ({
    inventoryItem: { sku: v.sku },
    optionValues: [{ optionName: "Størrelse", name: v.size }],
    price: v.price ? String(v.price) : "0",
  })),
});

const varErrors = varResult.productVariantsBulkCreate.userErrors;
if (varErrors.length > 0) {
  console.log(`  ⚠ Variant errors: ${varErrors.map((e) => e.message).join(", ")}`);
} else {
  console.log(`  ✓ ${product.variants.length} variants added`);
}

// Step 4: Delete default variant
if (defaultVariantId) {
  await shopifyGraphQL(DELETE_VARIANTS, {
    productId,
    variantsIds: [defaultVariantId],
  });
}
await sleep(300);

// Step 5: Upload images
console.log("Uploading images...");
for (const v of product.variants) {
  if (!v.imageFile) continue;
  const imgPath = resolve(mdDir, v.imageFile);
  if (!existsSync(imgPath)) {
    console.log(`  ⚠ Image not found: ${v.imageFile}`);
    continue;
  }
  try {
    await uploadImage(productId, imgPath, v.imageFile);
    console.log(`  ✓ ${v.imageFile}`);
  } catch (err) {
    console.log(`  ✗ ${v.imageFile} — ${err.message}`);
  }
  await sleep(1000);
}

console.log(`\nDone! Product "${product.title}" created with ${product.variants.length} variants.`);
console.log("Remember to publish it to Online Store in Shopify admin.");
