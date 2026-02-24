#!/usr/bin/env node
/**
 * Quick test: creates a "test_note" metaobject definition + one entry.
 */

import { shopifyGraphQL } from "../shopify-client.js";

// Step 1 — Create the definition
console.log("Creating metaobject definition: test_note...");

const defResult = await shopifyGraphQL(`
  mutation {
    metaobjectDefinitionCreate(definition: {
      type: "test_note"
      name: "Test Note"
      fieldDefinitions: [
        { key: "title", name: "Title", type: "single_line_text_field" }
        { key: "body", name: "Body", type: "multi_line_text_field" }
      ]
    }) {
      metaobjectDefinition {
        type
        id
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
  console.log("Definition errors:", defErrors);
  // If it already exists, that's fine — continue to create the entry
  if (!defErrors.some(e => e.message.includes("already exists"))) {
    process.exit(1);
  }
  console.log("(Definition already exists, continuing...)");
} else {
  console.log("Definition created:", defResult.metaobjectDefinitionCreate.metaobjectDefinition.type);
}

// Step 2 — Create one entry
console.log("\nCreating a test entry...");

const entryResult = await shopifyGraphQL(`
  mutation {
    metaobjectCreate(metaobject: {
      type: "test_note"
      fields: [
        { key: "title", value: "Hello from the script" }
        { key: "body", value: "This is a test metaobject created via the Admin API." }
      ]
    }) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`);

const entryErrors = entryResult.metaobjectCreate.userErrors;
if (entryErrors.length > 0) {
  console.error("Entry errors:", entryErrors);
  process.exit(1);
}

console.log("Entry created!");
console.log("  ID:", entryResult.metaobjectCreate.metaobject.id);
console.log("  Handle:", entryResult.metaobjectCreate.metaobject.handle);
console.log("\nDone! Check your Shopify admin → Content → Test Note");
