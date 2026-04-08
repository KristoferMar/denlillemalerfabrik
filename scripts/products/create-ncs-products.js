#!/usr/bin/env node
/**
 * Creates "Specialblanding" (custom NCS color) products in Shopify.
 *
 * - One product per paint type (6 total)
 * - Each product gets 3 variants: 5L, 10L, 20L
 * - Customers enter their NCS code at checkout via line item properties
 * - Pricing includes a small premium over standard colors
 *
 * Usage:
 *   node create-ncs-products.js --dry-run     Preview what will be created
 *   node create-ncs-products.js               Create all products
 *   node create-ncs-products.js --skip-images  Create without uploading images
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_IMAGES = process.argv.includes("--skip-images");

// ─── Paint types with NCS pricing (small premium over standard) ─────

const PAINT_TYPES = [
  { prefix: "10", name: "Vægmaling",      tag: "vaegmaling",      prices: { "5L": "399", "10L": "649", "20L": "1149" } },
  { prefix: "20", name: "Loftmaling",     tag: "loftmaling",      prices: { "5L": "379", "10L": "619", "20L": "1099" } },
  { prefix: "30", name: "Træ & Metal",    tag: "trae-og-metal",   prices: { "5L": "429", "10L": "699", "20L": "1229" } },
  { prefix: "40", name: "Strukturmaling", tag: "strukturmaling",  prices: { "5L": "449", "10L": "729", "20L": "1279" } },
  { prefix: "50", name: "Træbeskyttelse", tag: "traebeskyttelse", prices: { "5L": "459", "10L": "749", "20L": "1299" } },
  { prefix: "60", name: "Gulvmaling",     tag: "gulvmaling",      prices: { "5L": "469", "10L": "769", "20L": "1349" } },
];

// ─── Build product list ─────────────────────────────────────────────

function buildProductList() {
  return PAINT_TYPES.map((paintType) => ({
    title: `Specialblanding — ${paintType.name}`,
    paintType,
    tags: [
      "paint",
      "specialblanding",
      `specialblanding-type:${paintType.tag}`,
      `paint-type-prefix:${paintType.prefix}`,
    ],
    variants: [
      { size: "5L",  price: paintType.prices["5L"],  sku: `NCS-${paintType.prefix}-5L` },
      { size: "10L", price: paintType.prices["10L"], sku: `NCS-${paintType.prefix}-10L` },
      { size: "20L", price: paintType.prices["20L"], sku: `NCS-${paintType.prefix}-20L` },
    ],
  }));
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

// ─── Main ───────────────────────────────────────────────────────────

const products = buildProductList();

console.log(`\n🎨 NCS Specialblanding Product Creator`);
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

    // Step 5: Set inventory to 100 for each variant (custom orders, keep high)
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
              quantity: 100,
            }],
          },
        });
        await sleep(300);
      }
    } catch (err) {
      console.log(`  ⚠ Inventory error: ${err.message}`);
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
