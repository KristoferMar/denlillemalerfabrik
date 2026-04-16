#!/usr/bin/env node
/**
 * Inspects the paint_type metaobject definition and a sample of entries,
 * so we can see whether glans is modeled as a field.
 */

import { shopifyGraphQL } from "../shopify-client.js";

// ─── 1. Definition (fields) ─────────────────────────────────────────
const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_type") {
      type
      name
      description
      fieldDefinitions {
        key
        name
        type { name }
        description
      }
    }
  }
`);

const def = defData.metaobjectDefinitionByType;
if (!def) {
  console.log("No paint_type definition found.");
  process.exit(0);
}

console.log(`Definition: ${def.type}  —  ${def.name}`);
if (def.description) console.log(`  ${def.description}`);
console.log(`\nFields (${def.fieldDefinitions.length}):`);
for (const f of def.fieldDefinitions) {
  console.log(`  - ${f.key} (${f.type.name}) — ${f.name}${f.description ? " — " + f.description : ""}`);
}

// ─── 2. Sample entries ──────────────────────────────────────────────
const entriesData = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_type", first: 50) {
      nodes {
        id
        handle
        displayName
        fields { key value type }
      }
    }
  }
`);

const entries = entriesData.metaobjects.nodes;
console.log(`\nEntries (${entries.length}):\n`);
for (const e of entries) {
  console.log(`  ${e.displayName}  (handle: ${e.handle})`);
  console.log(`    id: ${e.id}`);
  for (const f of e.fields) {
    const val = f.value?.length > 80 ? f.value.slice(0, 80) + "…" : f.value;
    console.log(`    ${f.key} [${f.type}] = ${val}`);
  }
  console.log();
}
