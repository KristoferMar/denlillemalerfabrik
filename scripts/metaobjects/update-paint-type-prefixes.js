#!/usr/bin/env node
/**
 * Adds the type_prefix field to paint_type definition and updates all entries.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Step 1: Add type_prefix field to the definition ─────────────────

console.log("Adding type_prefix field to paint_type definition...");

const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_type") {
      id
    }
  }
`);

const defId = defData.metaobjectDefinitionByType.id;

const updateDef = await shopifyGraphQL(`
  mutation UpdateDef($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`, {
  id: defId,
  definition: {
    fieldDefinitions: [
      { create: { key: "type_prefix", name: "Type Prefix", type: "single_line_text_field" } }
    ]
  }
});

const defErrors = updateDef.metaobjectDefinitionUpdate.userErrors;
if (defErrors.length > 0) {
  if (defErrors.some(e => e.message.includes("already exists") || e.message.includes("taken"))) {
    console.log("Field already exists, continuing...");
  } else {
    console.error("Error:", defErrors);
    process.exit(1);
  }
} else {
  console.log("Field added.\n");
}

// ─── Step 2: Update each paint_type entry with its prefix ────────────

const prefixes = {
  "Vægmaling": "10",
  "Loftmaling": "20",
  "Træ & Metal": "30",
  "Strukturmaling": "40",
  "Træbeskyttelse": "50",
  "Gulvmaling": "60",
};

const entries = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_type", first: 50) {
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

console.log("Updating paint_type entries with prefixes...\n");

for (const entry of entries.metaobjects.nodes) {
  const name = entry.fields.find(f => f.key === "name")?.value;
  const prefix = prefixes[name];

  if (!prefix) {
    console.log(`  ? ${name} — no prefix defined, skipping`);
    continue;
  }

  const result = await shopifyGraphQL(`
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
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
    id: entry.id,
    metaobject: {
      fields: [
        { key: "type_prefix", value: prefix }
      ]
    }
  });

  const errors = result.metaobjectUpdate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${name} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${name} → prefix ${prefix}`);
  }

  await sleep(200);
}

console.log("\nDone!");
