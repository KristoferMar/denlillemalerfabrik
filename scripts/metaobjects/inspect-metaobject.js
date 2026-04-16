#!/usr/bin/env node
/**
 * Fetch a metaobject by ID and print its type + fields.
 *
 * Usage: node scripts/metaobjects/inspect-metaobject.js gid://shopify/Metaobject/123
 */

import { shopifyGraphQL } from "../shopify-client.js";

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (ids.length === 0) {
  console.error("Pass one or more metaobject gids");
  process.exit(1);
}

for (const id of ids) {
  const data = await shopifyGraphQL(`
    query ($id: ID!) {
      metaobject(id: $id) {
        id
        type
        handle
        displayName
        fields { key value type }
      }
    }
  `, { id });

  const m = data.metaobject;
  if (!m) {
    console.log(`(not found) ${id}`);
    continue;
  }
  console.log(`${m.type}  ${m.displayName}  (${m.handle})`);
  console.log(`  id: ${m.id}`);
  for (const f of m.fields) {
    const val = f.value?.length > 120 ? f.value.slice(0, 120) + "…" : f.value;
    console.log(`  ${f.key} [${f.type}] = ${val}`);
  }
  console.log();
}
