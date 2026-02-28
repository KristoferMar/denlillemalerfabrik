#!/usr/bin/env node
/**
 * Adds an "images" field (list.file_reference) to the color_combination
 * metaobject definition so each combination can hold room inspiration photos.
 *
 * Usage:
 *   node add-images-to-color-combinations.js
 */

import { shopifyGraphQL } from "../shopify-client.js";

// Step 1: Look up the definition ID by type
console.log("Looking up color_combination definition ID...");

const lookup = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "color_combination") {
      id
    }
  }
`);

const defId = lookup.metaobjectDefinitionByType?.id;
if (!defId) {
  console.error("Could not find color_combination definition.");
  process.exit(1);
}

console.log(`Found: ${defId}\n`);

// Step 2: Add the images field
console.log("Adding 'images' field...");

const result = await shopifyGraphQL(`
  mutation UpdateDef($id: ID!) {
    metaobjectDefinitionUpdate(
      id: $id
      definition: {
        fieldDefinitions: [
          {
            create: {
              key: "images"
              name: "Billeder"
              type: "list.file_reference"
            }
          }
        ]
      }
    ) {
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
`, { id: defId });

const errors = result.metaobjectDefinitionUpdate.userErrors;
if (errors.length > 0) {
  if (errors.some((e) => e.message.includes("already exists") || e.message.includes("taken"))) {
    console.log("Field 'images' already exists on the definition.");
  } else {
    console.error("Errors:", errors);
    process.exit(1);
  }
} else {
  console.log("\nDone! Updated fields:");
  for (const field of result.metaobjectDefinitionUpdate.metaobjectDefinition.fieldDefinitions) {
    console.log(`  - ${field.key} (${field.type.name})`);
  }
}
