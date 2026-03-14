#!/usr/bin/env node
/**
 * Adds color_family field to paint_color definition and updates all entries.
 * Maps DLM codes to their color family.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Family mapping by DLM code prefix ─────────────────────────────

const FAMILY_MAP = {
  "DLM0101": "Hvid",
  "DLM0102": "Hvid",
  "DLM0103": "Hvid",
  "DLM0104": "Hvid",

  "DLM0201": "Blå",
  "DLM0202": "Blå",
  "DLM0203": "Blå",
  "DLM0204": "Blå",

  "DLM0301": "Grå",
  "DLM0302": "Grå",
  "DLM0303": "Grå",
  "DLM0304": "Grå",

  "DLM0401": "Grøn",
  "DLM0402": "Grøn",
  "DLM0403": "Grøn",
  "DLM0404": "Grøn",

  "DLM0501": "Varm Neutral",
  "DLM0502": "Varm Neutral",
  "DLM0503": "Varm Neutral",
  "DLM0504": "Varm Neutral",

  "DLM0601": "Gul",
  "DLM0602": "Gul",
  "DLM0603": "Gul",
  "DLM0604": "Gul",

  "DLM0701": "Rosa",
  "DLM0702": "Rosa",
  "DLM0703": "Rosa",
  "DLM0704": "Rosa",

  "DLM0801": "Rød",
  "DLM0802": "Rød",
  "DLM0803": "Rød",
  "DLM0804": "Rød",
};

// ─── Step 1: Add color_family field to definition ───────────────────

console.log("Adding color_family field to paint_color definition...");

const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_color") {
      id
    }
  }
`);

const defId = defData.metaobjectDefinitionByType.id;

const updateDef = await shopifyGraphQL(`
  mutation UpdateDef($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { type }
      userErrors { field message }
    }
  }
`, {
  id: defId,
  definition: {
    fieldDefinitions: [
      { create: { key: "color_family", name: "Farvefamilie", type: "single_line_text_field" } }
    ]
  }
});

const defErrors = updateDef.metaobjectDefinitionUpdate.userErrors;
if (defErrors.length > 0) {
  if (defErrors.some(e => e.message.includes("already exists") || e.message.includes("taken"))) {
    console.log("Field already exists, continuing...\n");
  } else {
    console.error("Error:", defErrors);
    process.exit(1);
  }
} else {
  console.log("Field added.\n");
}

// ─── Step 2: Update each entry with color_family ────────────────────

const entries = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_color", first: 50) {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`);

console.log("Updating color entries with family values...\n");

let updated = 0;

for (const entry of entries.metaobjects.nodes) {
  const dlmCode = entry.fields.find(f => f.key === "dlm_code")?.value;
  const name = entry.fields.find(f => f.key === "name")?.value;
  const family = FAMILY_MAP[dlmCode];

  if (!family) {
    console.log(`  ? ${dlmCode} ${name} — no family defined, skipping`);
    continue;
  }

  const result = await shopifyGraphQL(`
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { handle }
        userErrors { field message }
      }
    }
  `, {
    id: entry.id,
    metaobject: {
      fields: [
        { key: "color_family", value: family }
      ]
    }
  });

  const errors = result.metaobjectUpdate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${dlmCode} ${name} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${dlmCode} ${name} → ${family}`);
    updated++;
  }

  await sleep(200);
}

console.log(`\nDone! Updated: ${updated}`);
