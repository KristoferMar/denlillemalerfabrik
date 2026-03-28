#!/usr/bin/env node
/**
 * Updates the Vægmaling collection title to "Featured Products".
 */

import { shopifyGraphQL } from "../shopify-client.js";

const FIND_COLLECTION = `
  query FindCollection {
    collections(first: 10, query: "title:Vægmaling") {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

const UPDATE_COLLECTION = `
  mutation UpdateCollection($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const data = await shopifyGraphQL(FIND_COLLECTION);
const collection = data.collections.nodes.find(c => c.title === "Vægmaling");

if (!collection) {
  console.error("Collection 'Vægmaling' not found.");
  process.exit(1);
}

console.log(`Found: "${collection.title}" (${collection.id})`);
console.log(`Renaming to "Featured Products"...`);

const result = await shopifyGraphQL(UPDATE_COLLECTION, {
  input: {
    id: collection.id,
    title: "Featured Products",
  },
});

const errors = result.collectionUpdate.userErrors;
if (errors.length > 0) {
  console.error(`Error: ${errors.map(e => e.message).join(", ")}`);
  process.exit(1);
}

const updated = result.collectionUpdate.collection;
console.log(`✓ Renamed to "${updated.title}" (handle: ${updated.handle})`);
