#!/usr/bin/env node
/**
 * Creates the paint_color metaobject definition + 25 color entries.
 *
 * Usage:
 *   node create-colors.js --dry-run    Preview what will be created
 *   node create-colors.js              Create definition + entries
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Color data ──────────────────────────────────────────────────────

const COLORS = [
  { name: "White 01", dlm_code: "DLM0101" },
  { name: "White 02", dlm_code: "DLM0102" },
  { name: "White 03", dlm_code: "DLM0103" },
  { name: "Sky 01", dlm_code: "DLM0201" },
  { name: "Sky 02", dlm_code: "DLM0202" },
  { name: "Sky 04", dlm_code: "DLM0204" },
  { name: "Grey 01", dlm_code: "DLM0301" },
  { name: "Grey 02", dlm_code: "DLM0302" },
  { name: "Grey 04", dlm_code: "DLM0304" },
  { name: "Mist 01", dlm_code: "DLM0401" },
  { name: "Mist 02", dlm_code: "DLM0402" },
  { name: "Mist 04", dlm_code: "DLM0404" },
  { name: "Beige 01", dlm_code: "DLM0501" },
  { name: "Beige 02", dlm_code: "DLM0502" },
  { name: "Beige 03", dlm_code: "DLM0503" },
  { name: "Sand 01", dlm_code: "DLM0601" },
  { name: "Sand 02", dlm_code: "DLM0602" },
  { name: "Sand 03", dlm_code: "DLM0603" },
  { name: "Dawn 01", dlm_code: "DLM0701" },
  { name: "Dawn 02", dlm_code: "DLM0702" },
  { name: "Dawn 03", dlm_code: "DLM0703" },
  { name: "Clay 01", dlm_code: "DLM0801" },
  { name: "Clay 02", dlm_code: "DLM0802" },
  { name: "Clay 03", dlm_code: "DLM0803" },
  { name: "Clay 04", dlm_code: "DLM0804" },
];

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Dry run ─────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be created.\n");
  console.log("Definition: paint_color");
  console.log("  Fields: name (single_line_text_field), dlm_code (single_line_text_field)\n");
  console.log(`Entries (${COLORS.length}):\n`);
  for (const c of COLORS) {
    console.log(`  ${c.dlm_code}  ${c.name}`);
  }
  console.log("\nRun without --dry-run to create.");
  process.exit(0);
}

// ─── Step 1: Create definition ───────────────────────────────────────

console.log("Creating metaobject definition: paint_color...");

const defResult = await shopifyGraphQL(`
  mutation {
    metaobjectDefinitionCreate(definition: {
      type: "paint_color"
      name: "Paint Color"
      fieldDefinitions: [
        { key: "name", name: "Name", type: "single_line_text_field" }
        { key: "dlm_code", name: "DLM Code", type: "single_line_text_field" }
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

console.log(`Creating ${COLORS.length} color entries...\n`);

let created = 0;
let failed = 0;

for (const color of COLORS) {
  const result = await shopifyGraphQL(`
    mutation CreateColor($metaobject: MetaobjectCreateInput!) {
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
      type: "paint_color",
      fields: [
        { key: "name", value: color.name },
        { key: "dlm_code", value: color.dlm_code },
      ],
    },
  });

  const errors = result.metaobjectCreate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${color.dlm_code}  ${color.name} — ${errors[0].message}`);
    failed++;
  } else {
    console.log(`  ✓ ${color.dlm_code}  ${color.name}`);
    created++;
  }

  await sleep(200);
}

console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
