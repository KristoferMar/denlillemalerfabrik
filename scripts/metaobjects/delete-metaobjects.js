#!/usr/bin/env node
/**
 * Delete all metaobjects of a given type.
 * Use with caution! Requires --confirm flag.
 *
 * Usage:
 *   node delete-metaobjects.js paint_color            (dry run — shows what would be deleted)
 *   node delete-metaobjects.js paint_color --confirm   (actually deletes)
 */

import { shopifyGraphQL, sleep, getScriptArgs } from "../shopify-client.js";

const LIST_ENTRIES = `
  query ListMetaobjects($type: String!, $first: Int!) {
    metaobjects(type: $type, first: $first) {
      nodes {
        id
        handle
        displayName
      }
    }
  }
`;

const DELETE_MUTATION = `
  mutation MetaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  const args = getScriptArgs();
  const type = args[2];
  const confirm = args.includes("--confirm");

  if (!type) {
    console.error("Usage: node delete-metaobjects.js <type> [--confirm]");
    process.exit(1);
  }

  const data = await shopifyGraphQL(LIST_ENTRIES, { type, first: 250 });
  const entries = data.metaobjects.nodes;

  if (entries.length === 0) {
    console.log(`\nNo metaobjects of type "${type}" found.\n`);
    return;
  }

  console.log(`\nFound ${entries.length} metaobjects of type "${type}":\n`);

  if (!confirm) {
    for (const entry of entries) {
      console.log(`  [DRY] Would delete: ${entry.displayName || entry.handle}`);
    }
    console.log(`\nRun with --confirm to actually delete them.\n`);
    return;
  }

  let deleted = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      const result = await shopifyGraphQL(DELETE_MUTATION, { id: entry.id });
      if (result.metaobjectDelete.userErrors.length > 0) {
        console.error(`  ✗ ${entry.displayName}: ${result.metaobjectDelete.userErrors.map((e) => e.message).join(", ")}`);
        errors++;
      } else {
        console.log(`  ✓ Deleted: ${entry.displayName || entry.handle}`);
        deleted++;
      }
    } catch (err) {
      console.error(`  ✗ ${entry.displayName}: ${err.message}`);
      errors++;
    }
    await sleep(500);
  }

  console.log(`\nDone! Deleted: ${deleted}, Errors: ${errors}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
