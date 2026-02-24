#!/usr/bin/env node
/**
 * Creates the paint_type metaobject definition + entries.
 *
 * Usage:
 *   node create-metaobject-paint-types-for-store.js --dry-run    Preview
 *   node create-metaobject-paint-types-for-store.js              Create
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Paint type data ─────────────────────────────────────────────────

const PAINT_TYPES = [
  { name: "Vægmaling" },
  { name: "Loftmaling" },
  { name: "Panelmaling" },
  { name: "Trædmaling" },
  { name: "Strukturmaling" },
  { name: "Træbeskyttelse" },
];

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Dry run ─────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be created.\n");
  console.log("Definition: paint_type");
  console.log("  Fields: name (single_line_text_field)\n");
  console.log(`Entries (${PAINT_TYPES.length}):\n`);
  for (const t of PAINT_TYPES) {
    console.log(`  ${t.name}`);
  }
  console.log("\nRun without --dry-run to create.");
  process.exit(0);
}

// ─── Step 1: Create definition ───────────────────────────────────────

console.log("Creating metaobject definition: paint_type...");

const defResult = await shopifyGraphQL(`
  mutation {
    metaobjectDefinitionCreate(definition: {
      type: "paint_type"
      name: "Paint Type"
      fieldDefinitions: [
        { key: "name", name: "Navn", type: "single_line_text_field" }
      ]
    }) {
      metaobjectDefinition {
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`);

const defErrors = defResult.metaobjectDefinitionCreate.userErrors;
if (defErrors.length > 0) {
  if (defErrors.some((e) => e.message.includes("already exists"))) {
    console.log("Definition already exists, continuing...\n");
  } else {
    console.error("Definition errors:", defErrors);
    process.exit(1);
  }
} else {
  console.log("Definition created.\n");
}

// ─── Step 2: Create entries ──────────────────────────────────────────

console.log(`Creating ${PAINT_TYPES.length} paint type entries...\n`);

let created = 0;
let failed = 0;

for (const type of PAINT_TYPES) {
  const result = await shopifyGraphQL(`
    mutation CreatePaintType($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject {
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    metaobject: {
      type: "paint_type",
      fields: [
        { key: "name", value: type.name },
      ],
    },
  });

  const errors = result.metaobjectCreate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${type.name} — ${errors[0].message}`);
    failed++;
  } else {
    console.log(`  ✓ ${type.name}`);
    created++;
  }

  await sleep(200);
}

console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
