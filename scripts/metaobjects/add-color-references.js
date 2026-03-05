#!/usr/bin/env node
/**
 * Adds paint_color reference fields (paint_color_1 – paint_color_5) to the
 * color_combination metaobject definition.
 *
 * After running this, you can assign paint_color metaobjects to each
 * combination via the Shopify admin.
 *
 * Usage:
 *   node add-color-references.js              Run
 *   node add-color-references.js --store xx   Target specific store
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Step 1: Get definition ID ──────────────────────────────────────

console.log("Looking up color_combination definition...");

const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "color_combination") {
      id
      fieldDefinitions {
        key
      }
    }
  }
`);

const defId = defData.metaobjectDefinitionByType.id;
const existingKeys = defData.metaobjectDefinitionByType.fieldDefinitions.map(f => f.key);

console.log(`Found definition: ${defId}`);
console.log(`Existing fields: ${existingKeys.join(", ")}\n`);

// ─── Step 2: Add reference fields ───────────────────────────────────

const fieldsToAdd = [];

for (let i = 1; i <= 5; i++) {
  const key = `paint_color_${i}`;
  if (existingKeys.includes(key)) {
    console.log(`  Field "${key}" already exists, skipping.`);
  } else {
    fieldsToAdd.push({
      create: {
        key,
        name: `Malingfarve ${i}`,
        type: "metaobject_reference",
        validations: [
          {
            name: "metaobject_definition_id",
            value: defData.metaobjectDefinitionByType.id // placeholder, we need paint_color def ID
          }
        ]
      }
    });
  }
}

if (fieldsToAdd.length === 0) {
  console.log("\nAll reference fields already exist. Done!");
  process.exit(0);
}

// Get paint_color definition ID for the validation
const paintColorDef = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_color") {
      id
    }
  }
`);

const paintColorDefId = paintColorDef.metaobjectDefinitionByType.id;
console.log(`\nPaint color definition ID: ${paintColorDefId}`);

// Set correct validation on each field
for (const field of fieldsToAdd) {
  field.create.validations = [
    {
      name: "metaobject_definition_id",
      value: paintColorDefId
    }
  ];
}

console.log(`\nAdding ${fieldsToAdd.length} reference fields...`);

const result = await shopifyGraphQL(`
  mutation UpdateDef($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        type
        fieldDefinitions {
          key
          name
          type {
            name
          }
        }
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
    fieldDefinitions: fieldsToAdd
  }
});

const errors = result.metaobjectDefinitionUpdate.userErrors;
if (errors.length > 0) {
  console.error("\nErrors:", errors);
  process.exit(1);
}

console.log("\nDone! Fields added:");
for (const f of result.metaobjectDefinitionUpdate.metaobjectDefinition.fieldDefinitions) {
  console.log(`  ${f.key} (${f.type.name})`);
}

console.log("\nYou can now assign paint colors to each combination in the Shopify admin.");
