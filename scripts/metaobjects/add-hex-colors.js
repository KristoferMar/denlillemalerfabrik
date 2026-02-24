#!/usr/bin/env node
/**
 * Adds hex_color field to paint_color definition and updates all entries.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Hex values for each DLM code ───────────────────────────────────

const HEX_MAP = {
  // White
  "DLM0101": "#FAFAFA",  // Snehvid
  "DLM0102": "#F5F0EB",  // Porcelæn
  "DLM0103": "#EDE8E0",  // Kalkhvid
  "DLM0104": "#F5EDD6",  // Cremehvid

  // Sky
  "DLM0201": "#E4EEF2",  // Isklar
  "DLM0202": "#C8DBE4",  // Himmellys
  "DLM0203": "#A3C1CE",  // Havbrise
  "DLM0204": "#5B8FA3",  // Dybhav

  // Grey
  "DLM0301": "#D6D8D6",  // Sølvtåge
  "DLM0302": "#B8B5AE",  // Drivsten
  "DLM0303": "#908D86",  // Granitgrå
  "DLM0304": "#6B6B6B",  // Skifergrå

  // Mist
  "DLM0401": "#E2EBE0",  // Morgendug
  "DLM0402": "#C5D9C2",  // Mynte
  "DLM0403": "#A3B5A0",  // Salvie
  "DLM0404": "#6B7F68",  // Skovdybde

  // Beige
  "DLM0501": "#F2EBE0",  // Elfenben
  "DLM0502": "#E8DCC8",  // Havremel
  "DLM0503": "#CDBA9E",  // Nougat
  "DLM0504": "#8B7355",  // Valnød

  // Sand
  "DLM0601": "#F0E8D8",  // Strandlys
  "DLM0602": "#DDD0B5",  // Klitsand
  "DLM0603": "#C8A84E",  // Ravgul
  "DLM0604": "#A67B4B",  // Karamel

  // Dawn
  "DLM0701": "#F0DDD8",  // Rosendug
  "DLM0702": "#E0A890",  // Solnedgang
  "DLM0703": "#B87548",  // Kobber
  "DLM0704": "#C06840",  // Terracotta

  // Clay
  "DLM0801": "#B85C42",  // Rødler
  "DLM0802": "#9B4332",  // Murstensrød
  "DLM0803": "#6E3428",  // Kastanje
  "DLM0804": "#4A2820",  // Mørk Jord
};

// ─── Step 1: Add hex_color field to definition ──────────────────────

console.log("Adding hex_color field to paint_color definition...");

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
      { create: { key: "hex_color", name: "Hex Farve", type: "single_line_text_field" } }
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

// ─── Step 2: Update each entry with hex color ───────────────────────

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

console.log("Updating color entries with hex values...\n");

let updated = 0;

for (const entry of entries.metaobjects.nodes) {
  const dlmCode = entry.fields.find(f => f.key === "dlm_code")?.value;
  const name = entry.fields.find(f => f.key === "name")?.value;
  const hex = HEX_MAP[dlmCode];

  if (!hex) {
    console.log(`  ? ${dlmCode} ${name} — no hex defined, skipping`);
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
        { key: "hex_color", value: hex }
      ]
    }
  });

  const errors = result.metaobjectUpdate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${dlmCode} ${name} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${dlmCode} ${name} → ${hex}`);
    updated++;
  }

  await sleep(200);
}

console.log(`\nDone! Updated: ${updated}`);
