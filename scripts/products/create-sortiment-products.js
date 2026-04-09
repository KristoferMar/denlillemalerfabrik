#!/usr/bin/env node
/**
 * Creates products from the LF Sortiment spreadsheet.
 *
 * - Groups rows by product name (multiple sizes = variants)
 * - Pricing: Udsalgspris = Indkøbspris × 2, Slutpris inkl. moms = Udsalgspris × 1.25
 * - Category becomes a tag, unit (enhed) stored as tag
 * - Vendor: Den Lille Malerfabrik
 *
 * Usage:
 *   node create-sortiment-products.js --dry-run     Preview
 *   node create-sortiment-products.js               Create all products
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Category tag mapping ───────────────────────────────────────────

const CATEGORY_TAGS = {
  "Spartel & Forbehandling": "spartel-forbehandling",
  "Væg & Loft": "vaeg-loft",
  "Træ & Metal": "trae-metal",
  "Træbeskyttelse & Olie": "traebeskyttelse-olie",
  "Mur & Facade & Tag": "mur-facade-tag",
  "Rens": "rens",
  "Epoxy": "epoxy",
  "Vægbeklædning": "vaegbeklaedning",
};

// ─── Read spreadsheet ───────────────────────────────────────────────

async function readSpreadsheet() {
  // Use a child process to run python since openpyxl is installed
  const { execSync } = await import("node:child_process");

  const xlsxPath = resolve(
    __dirname,
    "../../products/1771786868153_LF_Sortiment_v1_6_Med_Kostpriser.xlsx"
  );

  const script = `
import openpyxl, json
wb = openpyxl.load_workbook('${xlsxPath}', data_only=True)
ws = wb.active
rows = []
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
    rows.append({
        "kategori": row[0] if row[0] else "",
        "produktnavn": row[1] if row[1] else "",
        "stoerrelse": row[2] if row[2] else "",
        "enhed": row[3] if row[3] else "",
        "indkoebspris": float(row[4]) if row[4] else None,
    })
print(json.dumps(rows, ensure_ascii=False))
`;

  const result = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}'`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result);
}

// ─── Group rows into products ───────────────────────────────────────

function groupIntoProducts(rows) {
  const productMap = new Map();

  for (const row of rows) {
    if (!row.produktnavn) continue;

    const key = `${row.kategori}::${row.produktnavn}`;

    if (!productMap.has(key)) {
      productMap.set(key, {
        title: row.produktnavn,
        kategori: row.kategori,
        enhed: row.enhed,
        variants: [],
      });
    }

    const product = productMap.get(key);

    // Pricing: Udsalgspris = Indkøbspris × 2, Slutpris inkl. moms = Udsalgspris × 1.25
    let slutpris = null;
    if (row.indkoebspris != null) {
      const udsalgspris = row.indkoebspris * 2;
      slutpris = Math.round(udsalgspris * 1.25);
    }

    product.variants.push({
      size: row.stoerrelse,
      price: slutpris,
    });
  }

  return Array.from(productMap.values());
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

console.log("\n🎨 LF Sortiment Product Creator\n");
console.log("Reading spreadsheet...");

const rows = await readSpreadsheet();
const products = groupIntoProducts(rows);

console.log(`Found ${rows.length} rows → ${products.length} products\n`);

if (DRY_RUN) {
  console.log("DRY RUN — listing all products:\n");
  for (const p of products) {
    const catTag = CATEGORY_TAGS[p.kategori] || p.kategori;
    console.log(`  📦 ${p.title}`);
    console.log(`     Kategori: ${p.kategori} → tag: ${catTag}`);
    console.log(`     Enhed: ${p.enhed} → tag: enhed:${p.enhed}`);
    console.log(`     Variants:`);
    for (const v of p.variants) {
      console.log(`       - ${v.size}  → ${v.price != null ? v.price + " kr inkl. moms" : "pris mangler"}`);
    }
    console.log();
  }
  console.log(`Total: ${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants`);
  process.exit(0);
}

let created = 0;
let failed = 0;

for (const p of products) {
  const catTag = CATEGORY_TAGS[p.kategori] || p.kategori;
  const tags = ["sortiment", `kategori:${catTag}`, `enhed:${p.enhed}`];

  try {
    console.log(`Creating: ${p.title}...`);

    // Step 1: Create product
    const result = await shopifyGraphQL(CREATE_PRODUCT, {
      product: {
        title: p.title,
        tags,
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

    // Step 3: Add real variants
    const varResult = await shopifyGraphQL(CREATE_VARIANTS, {
      productId,
      variants: p.variants.map((v) => ({
        optionValues: [{ optionName: "Størrelse", name: v.size }],
        price: v.price != null ? String(v.price) : "0",
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

    // Step 5: Disable inventory tracking (these are made-to-order / flexible stock)
    try {
      const invData = await shopifyGraphQL(GET_VARIANT_INVENTORY, { productId });
      const variants = invData.product.variants.nodes;
      for (const variant of variants) {
        await shopifyGraphQL(
          `mutation($id: ID!) { inventoryItemUpdate(id: $id, input: { tracked: false }) { inventoryItem { id } userErrors { field message } } }`,
          { id: variant.inventoryItem.id }
        );
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
}
