#!/usr/bin/env node
/**
 * Migrates a colored paint product by adding `Glans` as a second variant
 * option alongside `Størrelse`. Uses Shopify's productSet mutation so the
 * option + variants are swapped atomically.
 *
 * Skips:
 *   - Specialblanding products (custom NCS tint — customer specifies glans)
 *   - Products already carrying a "Glans" option (idempotent re-runs)
 *   - Products without a "full-code" tag (can't build a deterministic SKU)
 *
 * Usage:
 *   # Dry-run on ONE product — prints the plan, no writes
 *   node scripts/products/add-glans-variants.js --product vaegmaling-snehvid --dry-run
 *
 *   # Apply on ONE product
 *   node scripts/products/add-glans-variants.js --product vaegmaling-snehvid
 *
 *   # Dry-run ALL paint-tagged products (excluding specialblanding)
 *   node scripts/products/add-glans-variants.js --all --dry-run
 *
 *   # Apply to ALL
 *   node scripts/products/add-glans-variants.js --all
 */

import { shopifyGraphQL, getScriptArgs, sleep } from "../shopify-client.js";

// ─── Config ─────────────────────────────────────────────────────────
const GLANS_BY_TYPE = {
  vaegmaling: [5, 7, 10, 20],
  loftmaling: [2, 5],
  "trae-og-metal": [10, 20, 30, 40, 60],
  strukturmaling: [5, 10],
  traebeskyttelse: [10, 20, 40],
  gulvmaling: [30, 40, 60],
};

const SIZES = ["5L", "10L", "20L"];

// ─── CLI args ───────────────────────────────────────────────────────
const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");
const productIdx = args.indexOf("--product");
const HANDLE = productIdx !== -1 ? args[productIdx + 1] : null;

if (!HANDLE && !ALL) {
  console.error("Pass --product <handle> or --all. Add --dry-run to preview.");
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────
function parseTags(tags) {
  const parsed = {};
  for (const t of tags) {
    const i = t.indexOf(":");
    if (i !== -1) parsed[t.slice(0, i)] = t.slice(i + 1);
  }
  return parsed;
}

const PRODUCT_FIELDS = `
  id title handle tags
  options { id name values position }
  variants(first: 50) {
    nodes { id sku price inventoryQuantity title selectedOptions { name value } }
  }
`;

async function fetchProductByHandle(handle) {
  const data = await shopifyGraphQL(`
    query ($h: String!) {
      productByHandle(handle: $h) { ${PRODUCT_FIELDS} }
    }
  `, { h: handle });
  return data.productByHandle;
}

async function fetchAllPaintProducts() {
  const all = [];
  let cursor = null;
  while (true) {
    const data = await shopifyGraphQL(`
      query ($c: String) {
        products(first: 100, after: $c, query: "tag:paint") {
          pageInfo { hasNextPage endCursor }
          nodes { ${PRODUCT_FIELDS} }
        }
      }
    `, { c: cursor });
    all.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(200);
  }
  return all;
}

// ─── Decide whether a product is eligible ───────────────────────────
function classify(product) {
  const tags = parseTags(product.tags);

  if (tags["specialblanding"] !== undefined || tags["specialblanding-type"]) {
    return { skip: "specialblanding" };
  }
  if (!tags["full-code"]) {
    return { skip: "no full-code tag" };
  }

  const paintType = tags["paint-type"];
  const glansLevels = GLANS_BY_TYPE[paintType];
  if (!glansLevels) {
    return { skip: `unknown paint-type: ${paintType}` };
  }

  const hasGlansOption = product.options.some((o) => o.name === "Glans");
  if (hasGlansOption) {
    return { skip: "already has Glans option" };
  }

  return { tags, paintType, glansLevels, fullCode: tags["full-code"] };
}

// ─── Build new variant matrix ───────────────────────────────────────
function buildVariantMatrix(product, info) {
  const priceBySize = {};
  for (const v of product.variants.nodes) {
    priceBySize[v.title] = v.price;
  }
  for (const s of SIZES) {
    if (!priceBySize[s]) priceBySize[s] = product.variants.nodes[0].price;
  }

  const variants = [];
  for (const glans of info.glansLevels) {
    for (const size of SIZES) {
      variants.push({
        optionValues: [
          { optionName: "Glans", name: String(glans) },
          { optionName: "Størrelse", name: size },
        ],
        price: priceBySize[size],
        inventoryItem: {
          sku: `${info.fullCode}-G${glans}-${size}`,
          tracked: false, // produce-on-demand → don't track stock
        },
        inventoryPolicy: "CONTINUE", // sell regardless of stock count
      });
    }
  }
  return variants;
}

// ─── Apply migration via productSet ─────────────────────────────────
async function applyMigration(product, info, variants) {
  const input = {
    id: product.id,
    productOptions: [
      {
        name: "Glans",
        position: 1,
        values: info.glansLevels.map((g) => ({ name: String(g) })),
      },
      {
        name: "Størrelse",
        position: 2,
        values: SIZES.map((s) => ({ name: s })),
      },
    ],
    variants,
  };

  const res = await shopifyGraphQL(`
    mutation ($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product {
          id handle
          options { name values }
          variants(first: 50) {
            nodes { id sku price title selectedOptions { name value } }
          }
        }
        userErrors { field message code }
      }
    }
  `, { input });

  return res.productSet;
}

// ─── Per-product runner ─────────────────────────────────────────────
async function migrateOne(product) {
  const info = classify(product);
  if (info.skip) {
    console.log(`  [skip] ${product.title}  — ${info.skip}`);
    return { skipped: true, reason: info.skip };
  }

  const variants = buildVariantMatrix(product, info);

  console.log(`\n─── ${product.title}  (${product.handle}) ───`);
  console.log(`  paint-type: ${info.paintType}`);
  console.log(`  full-code:  ${info.fullCode}`);
  console.log(`  glans set:  ${info.glansLevels.join(", ")}`);
  console.log(`  new variants: ${variants.length}  (${info.glansLevels.length} glans × ${SIZES.length} sizes)`);
  for (const v of variants.slice(0, 4)) {
    console.log(`    G${v.optionValues[0].name.padStart(2)} / ${v.optionValues[1].name.padEnd(3)}  sku=${v.inventoryItem.sku}  price=${v.price}`);
  }
  if (variants.length > 4) console.log(`    … +${variants.length - 4} more`);

  if (DRY_RUN) {
    console.log(`  [dry-run] — no changes made.`);
    return { dryRun: true };
  }

  const res = await applyMigration(product, info, variants);
  if (res.userErrors?.length) {
    console.error(`  ERRORS:`);
    for (const e of res.userErrors) {
      console.error(`    ${e.field ? e.field.join(".") : ""}: ${e.message} (${e.code ?? ""})`);
    }
    return { error: true };
  }
  const newCount = res.product.variants.nodes.length;
  console.log(`  ✓ done. Product now has ${newCount} variants.`);
  return { ok: true };
}

// ─── Main ───────────────────────────────────────────────────────────
let targets;
if (HANDLE) {
  const p = await fetchProductByHandle(HANDLE);
  if (!p) {
    console.error(`No product with handle: ${HANDLE}`);
    process.exit(1);
  }
  targets = [p];
} else {
  targets = await fetchAllPaintProducts();
  console.log(`Found ${targets.length} paint-tagged products.`);
}

let ok = 0, skipped = 0, errors = 0;
for (const p of targets) {
  const r = await migrateOne(p);
  if (r.ok) ok++;
  if (r.skipped) skipped++;
  if (r.error) errors++;
  if (!DRY_RUN && !r.skipped) await sleep(400); // rate-limit friendly
}

console.log(`\n────────\nDone.  ok=${ok}  skipped=${skipped}  errors=${errors}${DRY_RUN ? "  (dry-run)" : ""}`);
