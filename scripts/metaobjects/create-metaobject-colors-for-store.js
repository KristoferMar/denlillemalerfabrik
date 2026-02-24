#!/usr/bin/env node
/**
 * Creates the paint_color metaobject definition + foundation color entries.
 *
 * Color code format: DLM[FF][SS]
 *   FF = color family (01–99)
 *   SS = shade (01–99, light to dark)
 *
 * See docs/dlm-color-code-system.md for the full specification.
 *
 * Usage:
 *   node create-metaobject-colors-for-store.js --dry-run    Preview
 *   node create-metaobject-colors-for-store.js              Create
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Foundation color palette ────────────────────────────────────────
//
// Family 01: White   — clean whites and off-whites
// Family 02: Sky     — cool blue-greys
// Family 03: Grey    — neutral greys
// Family 04: Mist    — soft green-greys
// Family 05: Beige   — warm neutrals
// Family 06: Sand    — golden warm tones
// Family 07: Dawn    — warm pinks and blush
// Family 08: Clay    — earthy reds and terracotta

const COLORS = [
  // ── White (01) ──
  { name: "Snehvid",       dlm_code: "DLM0101" },  // pure white
  { name: "Porcelæn",      dlm_code: "DLM0102" },  // soft white
  { name: "Kalkhvid",      dlm_code: "DLM0103" },  // chalky white
  { name: "Cremehvid",     dlm_code: "DLM0104" },  // cream white

  // ── Sky (02) ──
  { name: "Isklar",        dlm_code: "DLM0201" },  // icy pale blue
  { name: "Himmellys",     dlm_code: "DLM0202" },  // sky light
  { name: "Havbrise",      dlm_code: "DLM0203" },  // sea breeze
  { name: "Dybhav",        dlm_code: "DLM0204" },  // deep ocean

  // ── Grey (03) ──
  { name: "Sølvtåge",      dlm_code: "DLM0301" },  // silver mist
  { name: "Drivsten",      dlm_code: "DLM0302" },  // driftwood grey
  { name: "Granitgrå",     dlm_code: "DLM0303" },  // granite
  { name: "Skifergrå",     dlm_code: "DLM0304" },  // slate grey

  // ── Mist (04) ──
  { name: "Morgendug",     dlm_code: "DLM0401" },  // morning dew
  { name: "Mynte",         dlm_code: "DLM0402" },  // mint
  { name: "Salvie",        dlm_code: "DLM0403" },  // sage
  { name: "Skovdybde",     dlm_code: "DLM0404" },  // forest deep

  // ── Beige (05) ──
  { name: "Elfenben",      dlm_code: "DLM0501" },  // ivory
  { name: "Havremel",      dlm_code: "DLM0502" },  // oat
  { name: "Nougat",        dlm_code: "DLM0503" },  // nougat
  { name: "Valnød",        dlm_code: "DLM0504" },  // walnut

  // ── Sand (06) ──
  { name: "Strandlys",     dlm_code: "DLM0601" },  // beach light
  { name: "Klitsand",      dlm_code: "DLM0602" },  // dune sand
  { name: "Ravgul",        dlm_code: "DLM0603" },  // amber
  { name: "Karamel",       dlm_code: "DLM0604" },  // caramel

  // ── Dawn (07) ──
  { name: "Rosendug",      dlm_code: "DLM0701" },  // rose dew
  { name: "Solnedgang",    dlm_code: "DLM0702" },  // sunset
  { name: "Kobber",        dlm_code: "DLM0703" },  // copper
  { name: "Terracotta",    dlm_code: "DLM0704" },  // terracotta

  // ── Clay (08) ──
  { name: "Rødler",        dlm_code: "DLM0801" },  // red clay
  { name: "Murstensrød",   dlm_code: "DLM0802" },  // brick red
  { name: "Kastanje",      dlm_code: "DLM0803" },  // chestnut
  { name: "Mørk Jord",     dlm_code: "DLM0804" },  // dark earth
];

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Dry run ─────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be created.\n");
  console.log("Definition: paint_color");
  console.log("  Fields: name, dlm_code\n");

  let currentFamily = "";
  for (const c of COLORS) {
    const family = c.dlm_code.slice(3, 5);
    if (family !== currentFamily) {
      console.log();
      currentFamily = family;
    }
    console.log(`  ${c.dlm_code}  ${c.name}`);
  }
  console.log(`\nTotal: ${COLORS.length} colors across 8 families`);
  console.log("Run without --dry-run to create.");
  process.exit(0);
}

// ─── Step 1: Ensure definition exists ────────────────────────────────

console.log("Ensuring paint_color definition exists...");

const defResult = await shopifyGraphQL(`
  mutation {
    metaobjectDefinitionCreate(definition: {
      type: "paint_color"
      name: "Paint Color"
      fieldDefinitions: [
        { key: "name", name: "Navn", type: "single_line_text_field" }
        { key: "dlm_code", name: "DLM Kode", type: "single_line_text_field" }
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
  if (defErrors.some((e) => e.message.includes("already exists") || e.message.includes("taken"))) {
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
