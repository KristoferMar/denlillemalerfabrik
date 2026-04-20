#!/usr/bin/env node
/**
 * Populates the `custom.coverage_m2_per_litre` metafield on every paint-line
 * product (main paint line + Specialblanding) using the LOWER bound of the
 * coverage range from `malerbeskrivelser.md`. The Malerberegner uses this to
 * convert m² × coats → liters → bucket combination.
 *
 * Conservative-on-purpose: better to leave the customer with 1–2 L of touch-up
 * paint than to under-recommend and have them run out mid-wall.
 *
 * Usage:
 *   node scripts/products/set-coverage-metafield.js --dry-run
 *   node scripts/products/set-coverage-metafield.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Paint-type → conservative coverage (m²/L).
// Source: malerbeskrivelser.md, always the lowest value in the stated range.
// Træbeskyttelse uses the ru-træ low (4), not the høvlet-træ low (5) — covers
// the worst-case substrate so the calculator never under-recommends.
const COVERAGE_BY_TYPE = {
  vaegmaling: 6,          // 6–10
  loftmaling: 6,          // 6–8
  "trae-metal": 8,        // 8–12
  strukturmaling: 3,      // 3–5
  traebeskyttelse: 4,     // 4–7 ru træ (5–10 høvlet)
  gulvmaling: 8,          // 8–10
};

// Main paint line: glans products.
const PAINT_PRODUCTS = [
  ["vaegmaling-glans-10",        COVERAGE_BY_TYPE.vaegmaling],
  ["loftmaling-glans-5",         COVERAGE_BY_TYPE.loftmaling],
  ["trae-metal-glans-10",        COVERAGE_BY_TYPE["trae-metal"]],
  ["trae-metal-glans-20",        COVERAGE_BY_TYPE["trae-metal"]],
  ["trae-metal-glans-30",        COVERAGE_BY_TYPE["trae-metal"]],
  ["trae-metal-glans-40",        COVERAGE_BY_TYPE["trae-metal"]],
  ["trae-metal-glans-60",        COVERAGE_BY_TYPE["trae-metal"]],
  ["strukturmaling-glans-5",     COVERAGE_BY_TYPE.strukturmaling],
  ["traebeskyttelse-glans-10",   COVERAGE_BY_TYPE.traebeskyttelse],
  ["traebeskyttelse-glans-20",   COVERAGE_BY_TYPE.traebeskyttelse],
  ["traebeskyttelse-glans-40",   COVERAGE_BY_TYPE.traebeskyttelse],
  ["gulvmaling-glans-30",        COVERAGE_BY_TYPE.gulvmaling],
  ["gulvmaling-glans-40",        COVERAGE_BY_TYPE.gulvmaling],
  ["gulvmaling-glans-60",        COVERAGE_BY_TYPE.gulvmaling],
];

// Specialblanding inherits the target paint-type's coverage.
const SPECIALBLANDING_PRODUCTS = [
  ["specialblanding-vaegmaling",      COVERAGE_BY_TYPE.vaegmaling],
  ["specialblanding-loftmaling",      COVERAGE_BY_TYPE.loftmaling],
  ["specialblanding-trae-metal",      COVERAGE_BY_TYPE["trae-metal"]],
  ["specialblanding-strukturmaling",  COVERAGE_BY_TYPE.strukturmaling],
  ["specialblanding-traebeskyttelse", COVERAGE_BY_TYPE.traebeskyttelse],
  ["specialblanding-gulvmaling",      COVERAGE_BY_TYPE.gulvmaling],
];

const ALL_PRODUCTS = [...PAINT_PRODUCTS, ...SPECIALBLANDING_PRODUCTS];

// ─── GraphQL ────────────────────────────────────────────────────────

const FIND_DEFINITION = `
  query FindDefinition {
    metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: "custom", key: "coverage_m2_per_litre") {
      nodes { id name type { name } }
    }
  }
`;

const CREATE_DEFINITION = `
  mutation CreateDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id name }
      userErrors { field message code }
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) { id title handle }
  }
`;

const SET_METAFIELDS = `
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message code }
    }
  }
`;

// ─── Ensure metafield definition exists ─────────────────────────────

async function ensureDefinition() {
  const data = await shopifyGraphQL(FIND_DEFINITION, {});
  if (data.metafieldDefinitions.nodes.length > 0) {
    const def = data.metafieldDefinitions.nodes[0];
    console.log(`Metafield definition already exists: ${def.name} (${def.type.name})`);
    return;
  }

  console.log(`Creating metafield definition: custom.coverage_m2_per_litre (number_decimal)`);
  if (DRY_RUN) {
    console.log(`  (skipped — dry run)`);
    return;
  }

  const result = await shopifyGraphQL(CREATE_DEFINITION, {
    definition: {
      namespace: "custom",
      key: "coverage_m2_per_litre",
      name: "Coverage (m²/L)",
      description:
        "Conservative coverage used by the Malerberegner: m² covered by 1 L per coat. Low end of the real-world range — rounding is always in the customer's favor.",
      type: "number_decimal",
      ownerType: "PRODUCT",
    },
  });
  const errors = result.metafieldDefinitionCreate.userErrors;
  if (errors.length > 0) {
    console.error(`  ✗ ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    process.exit(1);
  }
  console.log(`  ✓ created`);
}

// ─── Resolve products ───────────────────────────────────────────────

async function resolveAll() {
  const plan = [];
  for (const [handle, coverage] of ALL_PRODUCTS) {
    const data = await shopifyGraphQL(GET_PRODUCT, { handle });
    const product = data.productByHandle;
    if (!product) {
      plan.push({ handle, coverage, status: "NOT FOUND" });
      continue;
    }
    plan.push({
      handle,
      coverage,
      status: "FOUND",
      id: product.id,
      title: product.title,
    });
  }
  return plan;
}

// ─── Main ───────────────────────────────────────────────────────────

await ensureDefinition();

console.log();
const plan = await resolveAll();

for (const entry of plan) {
  if (entry.status === "NOT FOUND") {
    console.log(`  ✗ ${entry.handle.padEnd(40)} NOT FOUND (will skip)`);
  } else {
    console.log(`  ✓ ${entry.handle.padEnd(40)} ${entry.coverage} m²/L  → ${entry.title}`);
  }
}

const applicable = plan.filter((p) => p.status === "FOUND");

if (DRY_RUN) {
  console.log(`\nDRY RUN — no writes. Re-run without --dry-run to apply.`);
  process.exit(0);
}

console.log(`\nSetting metafields…\n`);

// Batch into groups of 25 (Shopify's cap for metafieldsSet is 25 per call).
const BATCH_SIZE = 25;
let updated = 0;

for (let i = 0; i < applicable.length; i += BATCH_SIZE) {
  const batch = applicable.slice(i, i + BATCH_SIZE);
  const result = await shopifyGraphQL(SET_METAFIELDS, {
    metafields: batch.map((e) => ({
      ownerId: e.id,
      namespace: "custom",
      key: "coverage_m2_per_litre",
      type: "number_decimal",
      value: String(e.coverage),
    })),
  });

  const errors = result.metafieldsSet.userErrors;
  if (errors.length > 0) {
    console.error(`  ✗ batch ${i / BATCH_SIZE + 1}:`);
    for (const e of errors) console.error(`    - ${e.field?.join(".")}: ${e.code} ${e.message}`);
    process.exit(1);
  }

  for (const entry of batch) console.log(`  ✓ ${entry.handle} = ${entry.coverage}`);
  updated += batch.length;
  await sleep(300);
}

console.log(`\nDone. Set coverage on ${updated}/${applicable.length} products.`);
