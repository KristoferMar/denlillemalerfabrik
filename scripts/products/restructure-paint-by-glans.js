#!/usr/bin/env node
/**
 * Restructures the paint catalog from "one product per color" to
 * "one product per (paint-type, glans)" with Farve × Størrelse variants.
 *
 * For each paint-type, creates one new product per glans level. Each new
 * product has 32 colors × 3 sizes = 96 variants. SKUs are preserved
 * exactly (DLM{prefix}-{color-code-digits}-G{glans}-{size}). Each variant
 * is wired to its paint_color metaobject so the storefront can render
 * swatches.
 *
 * After the new products are created (DRAFT), the old per-color products
 * (and a couple of placeholder handles that conflict) are hard-deleted.
 *
 * Usage:
 *   # Dry-run — no writes
 *   node scripts/products/restructure-paint-by-glans.js --paint-type vaegmaling --dry-run
 *
 *   # Apply for vaegmaling pilot
 *   node scripts/products/restructure-paint-by-glans.js --paint-type vaegmaling
 *
 *   # Apply for all paint-types
 *   node scripts/products/restructure-paint-by-glans.js --all
 *
 *   # Skip the delete step (first-pass review)
 *   node scripts/products/restructure-paint-by-glans.js --paint-type vaegmaling --no-delete
 */

import { shopifyGraphQL, getScriptArgs, sleep } from "../shopify-client.js";

// ─── Config ──────────────────────────────────────────────────────────
// `handleStem` is the URL-friendly stem for product handles (may differ from
// the paint-type key; e.g. tag "trae-og-metal" → handle "trae-metal-...").
const PAINT_TYPES = {
  vaegmaling:      { name: "Vægmaling",      prefix: "10", glans: [5, 7, 10, 20],       titlePrefix: "Vægmaling",      handleStem: "vaegmaling" },
  loftmaling:      { name: "Loftmaling",     prefix: "20", glans: [2, 5],               titlePrefix: "Loftmaling",     handleStem: "loftmaling" },
  "trae-og-metal": { name: "Træ & Metal",    prefix: "30", glans: [10, 20, 30, 40, 60], titlePrefix: "Træ & Metal",    handleStem: "trae-metal" },
  strukturmaling:  { name: "Strukturmaling", prefix: "40", glans: [5, 10],              titlePrefix: "Strukturmaling", handleStem: "strukturmaling" },
  traebeskyttelse: { name: "Træbeskyttelse", prefix: "50", glans: [10, 20, 40],         titlePrefix: "Træbeskyttelse", handleStem: "traebeskyttelse" },
  gulvmaling:      { name: "Gulvmaling",     prefix: "60", glans: [30, 40, 60],         titlePrefix: "Gulvmaling",     handleStem: "gulvmaling" },
};

// Placeholder pricing — per-type ladders sourced from docs/product-launch-plan.md.
// Prices are uniform across color + glans within a paint-type.
const SIZES_BY_TYPE = {
  vaegmaling: [
    { label: "5L",  price: "299.00" },
    { label: "10L", price: "499.00" },
    { label: "20L", price: "899.00" },
  ],
  loftmaling: [
    { label: "5L",  price: "279.00" },
    { label: "10L", price: "469.00" },
    { label: "20L", price: "849.00" },
  ],
  "trae-og-metal": [
    { label: "5L",  price: "329.00" },
    { label: "10L", price: "549.00" },
    { label: "20L", price: "979.00" },
  ],
  strukturmaling: [
    { label: "5L",  price: "349.00" },
    { label: "10L", price: "579.00" },
    { label: "20L", price: "1029.00" },
  ],
  traebeskyttelse: [
    { label: "5L",  price: "359.00" },
    { label: "10L", price: "599.00" },
    { label: "20L", price: "1049.00" },
  ],
  gulvmaling: [
    { label: "5L",  price: "369.00" },
    { label: "10L", price: "619.00" },
    { label: "20L", price: "1099.00" },
  ],
};

// Sortiment-tagged placeholder handles to delete because they conflict
// with target handles (or are obsolete combo products). Verified manually.
const PLACEHOLDER_HANDLES_TO_DELETE = {
  vaegmaling:      ["vaegmaling-glans-10"],
  loftmaling:      [],
  "trae-og-metal": [],
  strukturmaling:  [],
  traebeskyttelse: [],
  gulvmaling:      [],
};

// ─── CLI args ────────────────────────────────────────────────────────
const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");
const NO_DELETE = args.includes("--no-delete");
const ptIdx = args.indexOf("--paint-type");
const PAINT_TYPE_ARG = ptIdx !== -1 ? args[ptIdx + 1] : null;

if (!PAINT_TYPE_ARG && !ALL) {
  console.error("Pass --paint-type <vaegmaling|loftmaling|trae-og-metal|strukturmaling|traebeskyttelse|gulvmaling> or --all. Add --dry-run to preview.");
  process.exit(1);
}

const PAINT_TYPES_TO_RUN = ALL ? Object.keys(PAINT_TYPES) : [PAINT_TYPE_ARG];
for (const pt of PAINT_TYPES_TO_RUN) {
  if (!PAINT_TYPES[pt]) {
    console.error(`Unknown paint-type: ${pt}. Valid: ${Object.keys(PAINT_TYPES).join(", ")}`);
    process.exit(1);
  }
}

// ─── Fetch all paint_color metaobjects (the canonical color list) ────
async function fetchPaintColors() {
  const data = await shopifyGraphQL(`{
    metaobjects(type: "paint_color", first: 250) {
      nodes {
        id handle
        fields { key value }
      }
    }
  }`);
  const colors = data.metaobjects.nodes.map((m) => {
    const f = Object.fromEntries(m.fields.map((x) => [x.key, x.value]));
    return {
      id: m.id,
      handle: m.handle,
      name: f.name,
      dlm_code: f.dlm_code,           // e.g. "DLM0101"
      hex_color: f.hex_color,         // e.g. "#FAFAFA"
      color_family: f.color_family,   // e.g. "Hvid"
    };
  });
  // Sort: by family then dlm_code (groups whites together, etc.)
  colors.sort((a, b) =>
    (a.color_family || "").localeCompare(b.color_family || "") ||
    (a.dlm_code || "").localeCompare(b.dlm_code || "")
  );
  return colors;
}

// ─── Fetch existing per-color products to delete after migration ─────
async function fetchPerColorProductsForType(paintType) {
  const all = [];
  let cursor = null;
  while (true) {
    const r = await shopifyGraphQL(`query($c:String){
      products(first:100, after:$c, query:"tag:paint AND tag:'paint-type:${paintType}' AND -tag:specialblanding") {
        pageInfo{ hasNextPage endCursor }
        nodes{ id handle title tags }
      }
    }`, { c: cursor });
    all.push(...r.products.nodes);
    if (!r.products.pageInfo.hasNextPage) break;
    cursor = r.products.pageInfo.endCursor;
    await sleep(150);
  }
  return all;
}

// ─── Lookup a product by handle (for placeholder cleanup) ────────────
async function fetchProductIdByHandle(handle) {
  const r = await shopifyGraphQL(
    `query($h:String!){ productByHandle(handle:$h){ id handle title } }`,
    { h: handle }
  );
  return r.productByHandle;
}

// ─── Build the productSet input for one new (paint-type, glans) ──────
function buildProductInput(paintTypeKey, glans, colors) {
  const cfg = PAINT_TYPES[paintTypeKey];
  const sizes = SIZES_BY_TYPE[paintTypeKey];
  const handle = `${cfg.handleStem}-glans-${glans}`;
  const title = `${cfg.titlePrefix} Glans ${glans}`;

  const variants = [];
  for (const c of colors) {
    const colorDigits = (c.dlm_code || "").replace(/^DLM/, ""); // "0101"
    for (const sz of sizes) {
      variants.push({
        optionValues: [
          { optionName: "Farve",     name: c.name },
          { optionName: "Størrelse", name: sz.label },
        ],
        price: sz.price,
        inventoryItem: { sku: `DLM${cfg.prefix}-${colorDigits}-G${glans}-${sz.label}`, tracked: false },
        inventoryPolicy: "CONTINUE",
        metafields: [
          { namespace: "custom", key: "paint_color", type: "metaobject_reference", value: c.id },
        ],
      });
    }
  }

  return {
    handle,
    title,
    status: "DRAFT",
    vendor: "Den Lille Malerfabrik",
    tags: [
      "paint",
      `paint-type:${paintTypeKey}`,
      `paint-type-prefix:${cfg.prefix}`,
      `glans:${glans}`,
    ],
    productOptions: [
      { name: "Farve",     position: 1, values: colors.map((c) => ({ name: c.name })) },
      { name: "Størrelse", position: 2, values: sizes.map((s) => ({ name: s.label })) },
    ],
    variants,
  };
}

// ─── Create one new product via productSet ───────────────────────────
async function createProduct(input) {
  const r = await shopifyGraphQL(`
    mutation($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product { id handle title status
          options { name values }
          variants(first: 250) { nodes { sku } }
        }
        userErrors { field message code }
      }
    }
  `, { input });
  return r.productSet;
}

// ─── Delete a product by id ──────────────────────────────────────────
async function deleteProduct(id) {
  const r = await shopifyGraphQL(`
    mutation($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors { field message }
      }
    }
  `, { input: { id } });
  return r.productDelete;
}

// ─── Per-paint-type runner ───────────────────────────────────────────
async function runPaintType(paintTypeKey, colors) {
  const cfg = PAINT_TYPES[paintTypeKey];
  console.log(`\n╔═══════════════════════════════════════════════════════`);
  const sizes = SIZES_BY_TYPE[paintTypeKey];
  console.log(`║  ${cfg.name}  (prefix ${cfg.prefix})`);
  console.log(`║  Glans levels: ${cfg.glans.join(", ")}`);
  console.log(`║  Colors: ${colors.length}  | Sizes: ${sizes.length}  (${sizes.map(s => `${s.label}=${s.price}`).join(", ")})`);
  console.log(`║  → ${cfg.glans.length} new products × ${colors.length * sizes.length} variants each`);
  console.log(`╚═══════════════════════════════════════════════════════`);

  // Step 1 — delete placeholder handles that conflict
  const placeholders = PLACEHOLDER_HANDLES_TO_DELETE[paintTypeKey] || [];
  for (const h of placeholders) {
    const p = await fetchProductIdByHandle(h);
    if (!p) { console.log(`  [skip] placeholder ${h} not found`); continue; }
    if (DRY_RUN) {
      console.log(`  [dry-run] would delete placeholder: ${p.handle} (${p.title})`);
    } else {
      const r = await deleteProduct(p.id);
      if (r.userErrors?.length) console.error(`  ERROR deleting ${h}: ${JSON.stringify(r.userErrors)}`);
      else console.log(`  ✓ deleted placeholder: ${h}`);
      await sleep(200);
    }
  }

  // Step 2 — create new (paint-type, glans) products
  const created = [];
  for (const glans of cfg.glans) {
    const input = buildProductInput(paintTypeKey, glans, colors);
    console.log(`\n  ── ${input.title}  (${input.handle}) — ${input.variants.length} variants`);
    for (const v of input.variants.slice(0, 2)) {
      const opts = v.optionValues.map((o) => `${o.optionName}:${o.name}`).join(" / ");
      console.log(`     ${opts.padEnd(40)}  sku=${v.inventoryItem.sku}  $${v.price}`);
    }
    if (input.variants.length > 2) console.log(`     … +${input.variants.length - 2} more`);

    if (DRY_RUN) {
      console.log(`     [dry-run] would create.`);
      continue;
    }

    const res = await createProduct(input);
    if (res.userErrors?.length) {
      console.error(`     ✗ ERRORS:`);
      for (const e of res.userErrors) console.error(`       ${e.field?.join(".")}: ${e.message} (${e.code})`);
      // Abort immediately — do NOT proceed to delete old products if we
      // failed to create their replacement. (See 2026-04-16 incident where
      // a metafield-definition error wiped 38 products without replacement.)
      console.error(`\n  ✗ Aborting run. No old products will be deleted for this paint-type.`);
      process.exit(1);
    }
    console.log(`     ✓ created: ${res.product.handle}  (${res.product.variants.nodes.length} variants)`);
    created.push(res.product);
    await sleep(400);
  }

  // Step 3 — delete old per-color products
  if (NO_DELETE) {
    console.log(`\n  [--no-delete] skipping deletion of old per-color products`);
    return { created };
  }

  const old = await fetchPerColorProductsForType(paintTypeKey);
  console.log(`\n  Old per-color products to delete: ${old.length}`);
  for (const p of old) {
    if (DRY_RUN) {
      console.log(`    [dry-run] would delete: ${p.handle} (${p.title})`);
    } else {
      const r = await deleteProduct(p.id);
      if (r.userErrors?.length) console.error(`    ✗ ${p.handle}: ${JSON.stringify(r.userErrors)}`);
      else console.log(`    ✓ deleted: ${p.handle}`);
      await sleep(250);
    }
  }
  return { created, deleted: old.length };
}

// ─── Main ────────────────────────────────────────────────────────────
console.log(DRY_RUN ? "─── DRY-RUN: no writes will happen ───" : "─── LIVE RUN ───");

const colors = await fetchPaintColors();
console.log(`Loaded ${colors.length} paint_color entries from metaobjects.`);
if (colors.length === 0) {
  console.error("No colors found. Aborting.");
  process.exit(1);
}

for (const pt of PAINT_TYPES_TO_RUN) {
  await runPaintType(pt, colors);
}

console.log(`\nDone.${DRY_RUN ? "  (dry-run — nothing written)" : ""}`);
