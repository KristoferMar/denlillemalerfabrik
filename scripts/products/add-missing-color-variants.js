#!/usr/bin/env node
/**
 * Add the missing 168 paint-color variants to every configurator paint product.
 *
 * Background
 * ──────────
 * The color palette was expanded from 32 anchor colors to 200 nuances on
 * 2026-05-12, but the Shopify variants weren't expanded with it. Result:
 * the product-finder configurator's "Dit valg" preview image, price, and
 * "Læg i kurv" CTA only resolve for the first 32 colors — the other 168
 * silently fall through `variantsByKey.get(...)` and render as empty.
 *
 * What this script does
 * ─────────────────────
 * For each of the configurator's paint products (the `CFG_HANDLES` list,
 * mirroring `sections/kmeconsulting-product-finder.liquid`):
 *
 *   1. Fetches the product (id, "Farve" option, all current variants).
 *   2. Reads the 200-color palette from docs/colors/dlm-colors-with-ncs.json.
 *   3. Computes the set of Farve values that are missing on the product.
 *   4. Derives paint_prefix + glans + price-per-size from existing variants
 *      (so we don't have to hardcode pricing — any color × size sample wins,
 *      since prices are color-agnostic in the current catalog).
 *   5. Calls productOptionUpdate to append the missing color names to the
 *      "Farve" option (Shopify requires the option to know the value
 *      before a variant can use it).
 *   6. Calls productVariantsBulkCreate to create `missing_colors × sizes`
 *      new variants, with SKU `DLM{prefix}-{0000}-G{glans}-{size}` and
 *      inventoryPolicy=CONTINUE (matches the existing variants).
 *
 * Idempotent: re-running is a no-op for products that already have all 200
 * colors. Run with --dry-run first to see the per-product plan.
 *
 * Usage:
 *   node scripts/products/add-missing-color-variants.js --dry-run
 *   node scripts/products/add-missing-color-variants.js
 *   node scripts/products/add-missing-color-variants.js --handle vaegmaling-glans-10
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Targets — keep in sync with sections/kmeconsulting-product-finder.liquid ──
// (cfg_handles array). Products in this list that don't exist on Shopify are
// skipped with a warning; that's expected for loftmaling-glans-2 and
// trae-metal-glans-30, which the configurator references but aren't built yet.
const CFG_HANDLES = [
  "vaegmaling-glans-5",
  "vaegmaling-glans-10",
  "loftmaling-glans-2",
  "loftmaling-glans-5",
  "trae-metal-glans-30",
  "trae-metal-glans-40",
  "traebeskyttelse-glans-20",
];

// Optional CLI filter: --handle X (only process that handle)
const ONLY_HANDLE = (() => {
  const i = process.argv.indexOf("--handle");
  return i !== -1 ? process.argv[i + 1] : null;
})();

// ─── Load the 200-color palette (source of truth) ──────────────────────────
const COLORS = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../docs/colors/dlm-colors-with-ncs.json"),
    "utf-8"
  )
);

if (!Array.isArray(COLORS) || COLORS.length === 0) {
  console.error("Failed to load color palette JSON.");
  process.exit(1);
}

// Index by Danish name (the value stored in the Farve option) and by dlm_id
// suffix (the 4-digit code used in SKUs).
const COLORS_BY_NAME = new Map(COLORS.map((c) => [c.name_da, c]));

// ─── GraphQL ───────────────────────────────────────────────────────────────

// Product header + options. Variants are paginated separately because a
// product with all 200 colors × 4 sizes has 800 variants — well past the
// 250 / page connection cap.
const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      options(first: 5) {
        id
        name
        position
        optionValues { id name }
      }
    }
  }
`;

const GET_PRODUCT_VARIANTS = `
  query GetProductVariants($id: ID!, $cursor: String) {
    product(id: $id) {
      variants(first: 250, after: $cursor) {
        nodes {
          id
          sku
          price
          inventoryPolicy
          selectedOptions { name value }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const UPDATE_OPTION = `
  mutation UpdateOption(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToAdd: [OptionValueCreateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToAdd: $optionValuesToAdd
    ) {
      product { id }
      userErrors { field message code }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id sku title }
      userErrors { field message code }
    }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

// Derive paint-prefix + glans from an existing SKU.
// SKU pattern: "DLM10-0402-G10-10L" → { prefix: "10", glans: "10" }
function parseSkuMeta(sku) {
  const m = /^DLM(\d{2})-\d{4}-G(\d+)-/.exec(sku || "");
  if (!m) return null;
  return { prefix: m[1], glans: m[2] };
}

// Format an SKU for a (paint_prefix, color_code, glans, size) combo.
// color_code is the 4-digit suffix of the DLM id (e.g. "0402").
function buildSku(prefix, colorCode, glans, size) {
  return `DLM${prefix}-${colorCode}-G${glans}-${size}`;
}

// Pull a "price per size" map from existing variants, picking the first
// non-null price seen for each size. All colors share the same price in the
// current catalog, so this is safe.
function buildPriceMap(variants) {
  const m = new Map();
  for (const v of variants) {
    const size = (v.selectedOptions.find((o) => o.name === "Størrelse") || {}).value;
    if (!size) continue;
    if (!m.has(size)) m.set(size, v.price);
  }
  return m;
}

// Pull the set of currently-used Farve values from existing variants. We
// don't trust the option's `optionValues` alone because Shopify sometimes
// keeps stale option values that aren't actually attached to a variant.
function buildFarveSet(variants) {
  const s = new Set();
  for (const v of variants) {
    const c = (v.selectedOptions.find((o) => o.name === "Farve") || {}).value;
    if (c) s.add(c);
  }
  return s;
}

// Pull the set of currently-used Størrelse values (preserving the order they
// appear in via the existing option, so we don't reshuffle the merchant's
// preferred size order).
function buildSizeList(product) {
  const opt = product.options.find((o) => o.name === "Størrelse");
  if (!opt) return [];
  return opt.optionValues.map((ov) => ov.name);
}

// Sort missing colors by DLM id so the new option values appear in a
// predictable family-then-shade order in the Shopify admin.
function sortByDlmId(colors) {
  return [...colors].sort((a, b) => (a.dlm_id < b.dlm_id ? -1 : 1));
}

// ─── Process one product ───────────────────────────────────────────────────

async function processProduct(handle) {
  const { productByHandle: product } = await shopifyGraphQL(GET_PRODUCT, { handle });

  if (!product) {
    console.log(`  ✗ ${handle} — product does not exist on Shopify, skipping`);
    return { handle, skipped: true, reason: "missing" };
  }

  const farveOption = product.options.find((o) => o.name === "Farve");
  if (!farveOption) {
    console.log(`  ✗ ${handle} — no "Farve" option, skipping`);
    return { handle, skipped: true, reason: "no-farve-option" };
  }

  // Paginate variants — a fully-populated paint product can have 800 variants
  // (200 colors × 4 sizes), well past the 250 / page connection cap. Without
  // this loop the existingFarve set is truncated and the script tries to
  // re-create variants that already exist (which Shopify then rejects, but
  // it's still wasted bandwidth and noisy error output).
  const variants = [];
  let cursor = null;
  while (true) {
    const data = await shopifyGraphQL(GET_PRODUCT_VARIANTS, {
      id: product.id,
      cursor,
    });
    const page = data.product?.variants;
    if (!page) break;
    variants.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
    await sleep(200);
  }
  if (variants.length === 0) {
    console.log(`  ✗ ${handle} — no variants, skipping (run create-paint-products.js first)`);
    return { handle, skipped: true, reason: "no-variants" };
  }

  const existingFarve = buildFarveSet(variants);
  const sizes = buildSizeList(product);
  const priceMap = buildPriceMap(variants);

  // Derive paint_prefix + glans from any existing SKU. (All variants share
  // the same prefix/glans, so the first one with a valid SKU wins.)
  let skuMeta = null;
  for (const v of variants) {
    skuMeta = parseSkuMeta(v.sku);
    if (skuMeta) break;
  }
  if (!skuMeta) {
    console.log(`  ✗ ${handle} — could not derive paint prefix/glans from existing SKUs, skipping`);
    return { handle, skipped: true, reason: "sku-parse-failed" };
  }

  // Inventory policy: copy whatever the existing variants use (CONTINUE on
  // every paint product currently — kept dynamic in case that changes).
  const inventoryPolicy = variants[0].inventoryPolicy || "DENY";

  // Compute the missing colors. A color is "missing" iff its Danish name
  // isn't in the existing Farve set. (We use COLORS as the source of truth
  // so we don't accidentally add a color the merchant deliberately removed.)
  const missing = sortByDlmId(
    COLORS.filter((c) => !existingFarve.has(c.name_da))
  );

  console.log(
    `  • ${handle}: ${existingFarve.size}/${COLORS.length} colors present, ` +
      `${missing.length} to add × ${sizes.length} sizes = ` +
      `${missing.length * sizes.length} new variants`
  );

  if (missing.length === 0) {
    return { handle, skipped: true, reason: "complete" };
  }
  if (sizes.length === 0) {
    console.log(`  ✗ ${handle} — no Størrelse values found, skipping`);
    return { handle, skipped: true, reason: "no-sizes" };
  }

  // Sanity-check: every size must have a price in the priceMap. If not, we
  // refuse to proceed — better than emitting variants with zero or fallback
  // prices that would silently appear on the storefront.
  const missingPriceSize = sizes.find((s) => !priceMap.has(s));
  if (missingPriceSize) {
    console.log(
      `  ✗ ${handle} — no price sample found for size "${missingPriceSize}", skipping`
    );
    return { handle, skipped: true, reason: "no-price" };
  }

  if (DRY_RUN) {
    // Print the first three planned variants so the user can eyeball the SKU
    // pattern + prices before running for real.
    const sample = [];
    for (const c of missing.slice(0, 3)) {
      const code = c.dlm_id.slice(3); // "0205" from "DLM0205"
      for (const size of sizes) {
        sample.push({
          farve: c.name_da,
          size,
          sku: buildSku(skuMeta.prefix, code, skuMeta.glans, size),
          price: priceMap.get(size),
        });
      }
    }
    console.log("    Sample variants that would be created:");
    for (const s of sample) {
      console.log(
        `      ${s.sku.padEnd(22)} ${s.farve.padEnd(14)} ${s.size.padEnd(4)} ${s.price}`
      );
    }
    return {
      handle,
      planned: missing.length * sizes.length,
      missingColors: missing.length,
      sizes,
    };
  }

  // ─── Step 1: append missing color names to the "Farve" option ────────
  // productOptionUpdate must add the values before productVariantsBulkCreate
  // can reference them. Idempotent on Shopify's side — re-adding an existing
  // value is a no-op.
  const optionValuesToAdd = missing.map((c) => ({ name: c.name_da }));

  // Batch option-value adds — Shopify caps the input list size; 100 is safe.
  const OPT_BATCH = 100;
  for (let i = 0; i < optionValuesToAdd.length; i += OPT_BATCH) {
    const batch = optionValuesToAdd.slice(i, i + OPT_BATCH);
    const res = await shopifyGraphQL(UPDATE_OPTION, {
      productId: product.id,
      option: { id: farveOption.id, name: "Farve" },
      optionValuesToAdd: batch,
    });
    const errs = res.productOptionUpdate?.userErrors || [];
    // "already exists" is fine — idempotency.
    const fatal = errs.filter(
      (e) => !/already exists|has already been taken/i.test(e.message)
    );
    if (fatal.length) {
      console.log(`    ⚠ ${handle} optionUpdate errors:`);
      for (const e of fatal) console.log(`        ${e.message}`);
      return { handle, failed: true, errors: fatal };
    }
    await sleep(200);
  }
  console.log(`    ✓ Farve option now allows ${optionValuesToAdd.length} additional values`);

  // ─── Step 2: bulk-create the variants ─────────────────────────────────
  // Shopify's bulk endpoint accepts up to 250 variants per call. We batch
  // by color (each color = `sizes.length` variants) to stay well below.
  const COLORS_PER_BATCH = Math.max(1, Math.floor(200 / sizes.length));

  let createdCount = 0;
  const errors = [];

  for (let i = 0; i < missing.length; i += COLORS_PER_BATCH) {
    const batchColors = missing.slice(i, i + COLORS_PER_BATCH);
    const batchVariants = [];
    for (const c of batchColors) {
      const code = c.dlm_id.slice(3);
      for (const size of sizes) {
        batchVariants.push({
          optionValues: [
            { optionName: "Farve", name: c.name_da },
            { optionName: "Størrelse", name: size },
          ],
          price: priceMap.get(size),
          inventoryItem: {
            sku: buildSku(skuMeta.prefix, code, skuMeta.glans, size),
            tracked: false,
          },
          inventoryPolicy,
        });
      }
    }

    const res = await shopifyGraphQL(CREATE_VARIANTS, {
      productId: product.id,
      variants: batchVariants,
    });

    const userErrors = res.productVariantsBulkCreate?.userErrors || [];
    const created = res.productVariantsBulkCreate?.productVariants || [];

    // "Variant already exists" is acceptable (re-runs after partial failure).
    const fatal = userErrors.filter(
      (e) => !/already exists|already been taken/i.test(e.message)
    );

    createdCount += created.length;
    if (fatal.length) {
      errors.push(...fatal);
      console.log(`    ⚠ Batch ${Math.floor(i / COLORS_PER_BATCH) + 1}: ${fatal.length} errors`);
      for (const e of fatal.slice(0, 3)) {
        console.log(`        ${e.field?.join(".") || "?"}: ${e.message}`);
      }
    } else {
      console.log(
        `    ✓ Batch ${Math.floor(i / COLORS_PER_BATCH) + 1}: ` +
          `${created.length}/${batchVariants.length} variants created`
      );
    }

    // Be gentle on the rate limiter — bulk-create is expensive.
    await sleep(500);
  }

  return {
    handle,
    created: createdCount,
    planned: missing.length * sizes.length,
    errors,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Adding missing color variants to configurator paint products\n`);

const handles = ONLY_HANDLE ? [ONLY_HANDLE] : CFG_HANDLES;
const results = [];

for (const handle of handles) {
  try {
    const result = await processProduct(handle);
    results.push(result);
  } catch (err) {
    console.log(`  ✗ ${handle}: ${err.message}`);
    results.push({ handle, failed: true, errors: [{ message: err.message }] });
  }
  await sleep(400);
}

console.log("\n──────────────────────────────────────────────────────────────");
if (DRY_RUN) {
  const totalPlanned = results.reduce((n, r) => n + (r.planned || 0), 0);
  console.log(`DRY RUN — would add ${totalPlanned} variants across ${results.filter(r => r.planned).length} products.`);
  console.log("Re-run without --dry-run to apply.");
} else {
  const totalCreated = results.reduce((n, r) => n + (r.created || 0), 0);
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.failed).length;
  console.log(`Done — created ${totalCreated} variants, ${skipped} products skipped, ${failed} failed.`);
}
