#!/usr/bin/env node
/**
 * Imports products from the Lars Frey catalog (docs/products/products.md).
 *
 * Each ## heading becomes a Shopify product.
 * Each table row becomes a variant with SKU and price.
 *
 * Usage:
 *   node import-products-from-catalog.js --dry-run    Preview what will be created
 *   node import-products-from-catalog.js              Create products in Shopify
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Parse the markdown catalog ──────────────────────────────────────

function parseCatalog() {
  const md = readFileSync(
    resolve(__dirname, "../../docs/products/products.md"),
    "utf-8"
  );

  const products = [];
  let current = null;

  for (const line of md.split("\n")) {
    // New category = new product
    if (line.startsWith("## ")) {
      if (current) products.push(current);
      current = {
        title: line.replace("## ", "").trim(),
        variants: [],
      };
      continue;
    }

    // Table row (skip header and separator)
    if (current && line.startsWith("|") && !line.startsWith("|---") && !line.includes("Varenummer")) {
      const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        const price = cols[2].replace(/\./g, "").replace(",", ".").trim();
        const numericPrice = parseFloat(price);
        current.variants.push({
          sku: cols[0],
          name: cols[1],
          price: isNaN(numericPrice) || numericPrice <= 0 ? null : Math.round(numericPrice * 1.5),
        });
      }
    }
  }

  if (current) products.push(current);
  return products;
}

// ─── Derive a top-level tag from the product title ───────────────────

function deriveTag(title) {
  const lower = title.toLowerCase();
  if (lower.includes("pensl") || lower.includes("cykellak")) return "Pensler";
  if (lower.includes("rulle") && !lower.includes("håndtag") && !lower.includes("bakke") && !lower.includes("spand")) return "Ruller";
  if (lower.includes("rullehåndtag")) return "Rullehåndtag";
  if (lower.includes("sandpapir") || lower.includes("slibe")) return "Sandpapir";
  if (lower.includes("tape") || lower.includes("gaffa")) return "Tape";
  if (lower.includes("afdækning") || lower.includes("folie") || lower.includes("schutz")) return "Afdækning";
  if (lower.includes("spartel") || lower.includes("spartl")) return "Spartler";
  if (lower.includes("handske")) return "Handsker";
  if (lower.includes("anstryg")) return "Anstrygere";
  if (lower.includes("gulvrulle")) return "Ruller";
  if (lower.includes("bakke") || lower.includes("spand")) return "Malerbakker";
  if (lower.includes("teleskop")) return "Tilbehør";
  if (lower.includes("kunst")) return "Kunstpensler";
  return "Diverse";
}

// ─── GraphQL mutations ───────────────────────────────────────────────

// In 2025-01 API, productCreate does not accept variants inline.
// We create the product first, then add variants via productVariantsBulkCreate.

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

// Delete the default variant that Shopify auto-creates
const DELETE_VARIANTS = `
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_DEFAULT_VARIANT = `
  query GetDefaultVariant($productId: ID!) {
    product(id: $productId) {
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
  }
`;

// ─── Main ────────────────────────────────────────────────────────────

const products = parseCatalog();

console.log(`Found ${products.length} product categories in catalog.\n`);

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be created.\n");
  for (const p of products) {
    const tag = deriveTag(p.title);
    console.log(`  📦 ${p.title}  [${tag}]`);
    console.log(`     ${p.variants.length} variants`);
    for (const v of p.variants.slice(0, 3)) {
      console.log(`       - ${v.sku}  ${v.name}  ${v.price ?? "N/A"} DKK`);
    }
    if (p.variants.length > 3) {
      console.log(`       ... and ${p.variants.length - 3} more`);
    }
    console.log();
  }
  console.log(`Total: ${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants`);
  console.log("Run without --dry-run to create.");
  process.exit(0);
}

// ─── Create products ─────────────────────────────────────────────────

let created = 0;
let failed = 0;

for (const p of products) {
  const tag = deriveTag(p.title);

  try {
    // Step 1: Create product (no variants — API 2025-01 doesn't support inline)
    const result = await shopifyGraphQL(CREATE_PRODUCT, {
      product: {
        title: p.title,
        tags: [tag, "Lars Frey"],
        vendor: "Lars Frey Farve og Lak",
        status: "DRAFT",
        productOptions: [{ name: "Variant", values: [{ name: "Default" }] }],
      },
    });

    const errors = result.productCreate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${p.title} — ${errors.map((e) => e.message).join(", ")}`);
      failed++;
      await sleep(500);
      continue;
    }

    const productId = result.productCreate.product.id;
    console.log(`  ✓ ${p.title}`);
    created++;

    // Step 2: Get the auto-created default variant so we can remove it later
    const defaultVarResult = await shopifyGraphQL(GET_DEFAULT_VARIANT, { productId });
    const defaultVariantId = defaultVarResult.product.variants.nodes[0]?.id;
    await sleep(300);

    // Step 3: Add all real variants in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < p.variants.length; i += BATCH_SIZE) {
      const batch = p.variants.slice(i, i + BATCH_SIZE);
      const varResult = await shopifyGraphQL(CREATE_VARIANTS, {
        productId,
        variants: batch.map((v) => ({
          inventoryItem: { sku: v.sku },
          optionValues: [{ optionName: "Variant", name: v.name }],
          price: v.price ? String(v.price) : "0",
        })),
      });

      const varErrors = varResult.productVariantsBulkCreate.userErrors;
      if (varErrors.length > 0) {
        console.log(`    ⚠ Variant errors: ${varErrors.map((e) => e.message).join(", ")}`);
      } else {
        console.log(`    + ${batch.length} variants added`);
      }
      await sleep(300);
    }

    // Step 4: Remove the default "Default" variant
    if (defaultVariantId) {
      await shopifyGraphQL(DELETE_VARIANTS, {
        productId,
        variantsIds: [defaultVariantId],
      });
    }
  } catch (err) {
    console.log(`  ✗ ${p.title} — ${err.message}`);
    failed++;
  }

  await sleep(500);
}

console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
