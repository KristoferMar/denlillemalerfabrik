#!/usr/bin/env node
/**
 * Creates the color_combination metaobject definition + initial entries
 * for the "Farvelab" (Color Lab) section.
 *
 * Each combination has a name, description, and 3–5 hex colors.
 *
 * Usage:
 *   node create-color-combinations.js --dry-run    Preview
 *   node create-color-combinations.js              Create
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── COLOR COMBINATIONS ──────────────────────────────────────────────

const COMBINATIONS = [
  {
    name: "Scandinavian Warm",
    description: "Varme, naturlige toner med et moderne nordisk touch.",
    color_1: "#F5F0EB",
    color_2: "#A3B18A",
    color_3: "#3D3D3D",
  },
  {
    name: "Modern Classic",
    description: "Tidløst udtryk med navy og guld på hvid baggrund.",
    color_1: "#FFFFFF",
    color_2: "#2C3E50",
    color_3: "#C5A258",
  },
  {
    name: "Earthy Natural",
    description: "Jordnære toner inspireret af naturen.",
    color_1: "#F0E6D3",
    color_2: "#C67A4B",
    color_3: "#6B705C",
  },
  {
    name: "Soft Nordic",
    description: "Bløde, dæmpede farver for en rolig atmosfære.",
    color_1: "#FAF8F5",
    color_2: "#D4A5A5",
    color_3: "#B0BEC5",
  },
  {
    name: "Bold & Rich",
    description: "Kraftige, dybe farver der skaber karakter.",
    color_1: "#F5F1EB",
    color_2: "#2D4A3E",
    color_3: "#CC6B3A",
  },
  {
    name: "Scandinavian Minimalism",
    description: "Enkel, skandinavisk minimalisme med neutrale toner.",
    color_1: "#CAB3A0",  // Familiar Beige — SW6093
    color_2: "#7A848D",  // Storm Cloud — SW6249
  },
  {
    name: "Conscious Color",
    description: "Bevidste farvevalg med naturens dybde.",
    color_1: "#4F523A",  // Secret Garden — SW6181
    color_2: "#B8A992",  // Universal Khaki — SW6150
  },
  {
    name: "Neutrals and Nature",
    description: "Neutrale toner med et strejf af natur.",
    color_1: "#EEE7D9",  // Creamy — SW7012
    color_2: "#F5E5BC",  // Lemon Chiffon — SW6686
    color_3: "#B8A992",  // Universal Khaki — SW6150
  },
  {
    name: "Blurring the Lines",
    description: "Overraskende dybe toner der flyder sammen.",
    color_1: "#B8A992",  // Universal Khaki — SW6150
    color_2: "#6F6459",  // Griffin — SW7026
    color_3: "#5F3D3F",  // Cordovan — SW6027
  },
];

// ─── CONFIG ──────────────────────────────────────────────────────────

const METAOBJECT_TYPE = "color_combination";
const DRY_RUN = process.argv.includes("--dry-run");

// ─── DRY RUN ─────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be created.\n");
  console.log(`Definition: ${METAOBJECT_TYPE}`);
  console.log("  Fields: name, description, color_1, color_2, color_3, color_4, color_5\n");

  for (const combo of COMBINATIONS) {
    const colors = [combo.color_1, combo.color_2, combo.color_3, combo.color_4, combo.color_5]
      .filter(Boolean)
      .join("  ");
    console.log(`  ${combo.name}`);
    console.log(`    ${combo.description}`);
    console.log(`    ${colors}`);
    console.log();
  }

  console.log(`Total: ${COMBINATIONS.length} combinations`);
  console.log("Run without --dry-run to create.");
  process.exit(0);
}

// ─── Step 1: Create definition ───────────────────────────────────────

console.log(`Ensuring ${METAOBJECT_TYPE} definition exists...`);

const defResult = await shopifyGraphQL(`
  mutation {
    metaobjectDefinitionCreate(definition: {
      type: "${METAOBJECT_TYPE}"
      name: "Color Combination"
      fieldDefinitions: [
        { key: "name",        name: "Navn",        type: "single_line_text_field" }
        { key: "description", name: "Beskrivelse", type: "single_line_text_field" }
        { key: "color_1",     name: "Farve 1",     type: "single_line_text_field" }
        { key: "color_2",     name: "Farve 2",     type: "single_line_text_field" }
        { key: "color_3",     name: "Farve 3",     type: "single_line_text_field" }
        { key: "color_4",     name: "Farve 4",     type: "single_line_text_field" }
        { key: "color_5",     name: "Farve 5",     type: "single_line_text_field" }
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

console.log(`Creating ${COMBINATIONS.length} color combinations...\n`);

let created = 0;
let failed = 0;

for (const combo of COMBINATIONS) {
  const handle = combo.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9æøå]+/g, "-").replace(/-+$/, "").replace(/^-+/, "");

  const fields = [
    { key: "name", value: combo.name },
    { key: "description", value: combo.description },
    { key: "color_1", value: combo.color_1 },
    { key: "color_2", value: combo.color_2 },
  ];

  if (combo.color_3) fields.push({ key: "color_3", value: combo.color_3 });
  if (combo.color_4) fields.push({ key: "color_4", value: combo.color_4 });
  if (combo.color_5) fields.push({ key: "color_5", value: combo.color_5 });

  try {
    const result = await shopifyGraphQL(`
      mutation CreateCombination($metaobject: MetaobjectCreateInput!) {
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
        type: METAOBJECT_TYPE,
        handle,
        fields,
      },
    });

    const errors = result.metaobjectCreate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${combo.name} — ${errors[0].message}`);
      failed++;
    } else {
      const colors = [combo.color_1, combo.color_2, combo.color_3, combo.color_4, combo.color_5]
        .filter(Boolean)
        .join(" ");
      console.log(`  ✓ ${combo.name}  (${colors})`);
      created++;
    }
  } catch (err) {
    console.error(`  ✗ ${combo.name}: ${err.message}`);
    failed++;
  }

  await sleep(500);
}

console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
