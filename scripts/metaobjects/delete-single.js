#!/usr/bin/env node
/**
 * Delete a single metaobject by type + handle.
 *
 * Usage:
 *   node delete-single.js color_combination soft-nordic --store den-lille-malerfabrik
 */

import { shopifyGraphQL, getScriptArgs } from "../shopify-client.js";

const args = getScriptArgs();
const type = args[2];
const handle = args[3];

if (!type || !handle) {
  console.error("Usage: node delete-single.js <type> <handle>");
  process.exit(1);
}

const data = await shopifyGraphQL(
  `query($type: String!, $first: Int!) {
    metaobjects(type: $type, first: $first) {
      nodes { id handle displayName }
    }
  }`,
  { type, first: 250 }
);

const entry = data.metaobjects.nodes.find((n) => n.handle === handle);
if (!entry) {
  console.error(`No metaobject found with handle "${handle}"`);
  process.exit(1);
}

console.log(`Deleting: ${entry.displayName || entry.handle} (${entry.id})`);

const result = await shopifyGraphQL(
  `mutation($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }`,
  { id: entry.id }
);

const errors = result.metaobjectDelete.userErrors;
if (errors.length > 0) {
  console.error("Errors:", errors);
  process.exit(1);
}

console.log("Deleted successfully.");
