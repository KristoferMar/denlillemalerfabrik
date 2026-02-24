#!/usr/bin/env node
/**
 * List existing metaobjects by type.
 *
 * Usage:
 *   node list-metaobjects.js paint_color
 *   node list-metaobjects.js color_platform
 *   node list-metaobjects.js              (lists all definitions)
 */

import { shopifyGraphQL, getScriptArgs } from "../shopify-client.js";

const LIST_DEFINITIONS = `
  query {
    metaobjectDefinitions(first: 50) {
      nodes {
        type
        name
        fieldDefinitions {
          key
          name
          type { name }
        }
      }
    }
  }
`;

const LIST_ENTRIES = `
  query ListMetaobjects($type: String!, $first: Int!) {
    metaobjects(type: $type, first: $first) {
      nodes {
        id
        handle
        displayName
        fields {
          key
          value
        }
      }
    }
  }
`;

async function main() {
  const type = getScriptArgs()[2];

  if (!type) {
    // List all metaobject definitions
    console.log("\nMetaobject definitions in your store:\n");
    const data = await shopifyGraphQL(LIST_DEFINITIONS);
    for (const def of data.metaobjectDefinitions.nodes) {
      console.log(`  ${def.type} ("${def.name}")`);
      for (const field of def.fieldDefinitions) {
        console.log(`    - ${field.key} (${field.type.name})`);
      }
      console.log();
    }
    console.log("Run with a type to list entries: node list-metaobjects.js paint_color\n");
    return;
  }

  console.log(`\nMetaobjects of type "${type}":\n`);
  const data = await shopifyGraphQL(LIST_ENTRIES, { type, first: 250 });

  if (data.metaobjects.nodes.length === 0) {
    console.log("  (none found)\n");
    return;
  }

  for (const obj of data.metaobjects.nodes) {
    console.log(`  ${obj.displayName || obj.handle}`);
    for (const field of obj.fields) {
      if (field.value) {
        console.log(`    ${field.key}: ${field.value}`);
      }
    }
    console.log();
  }

  console.log(`Total: ${data.metaobjects.nodes.length}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
