#!/usr/bin/env node
/**
 * Creates Shopify collections for DLM paint products.
 *
 * Usage:
 *   node create-collections.js --dry-run     Preview what will be created
 *   node create-collections.js               Create all collections
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Collections to create ─────────────────────────────────────────

const COLLECTIONS = [
  {
    title: "Vægmaling",
    descriptionHtml: "<p>Vores komplette udvalg af vægmaling i 32 unikke farver.</p>",
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: "TAG", relation: "EQUALS", condition: "paint-type:vaegmaling" },
      ],
    },
  },
  {
    // Used by the homepage "Populære tilbehør" section. Auto-collects
    // every product whose product type is "Tilbehør" (set on Lars Frey
    // SKUs by scripts/products/set-product-types.js).
    title: "Tilbehør",
    descriptionHtml: "<p>Pensler, ruller, spartler og andet tilbehør til malerarbejdet.</p>",
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: "TYPE", relation: "EQUALS", condition: "Tilbehør" },
      ],
    },
  },
];

// ─── GraphQL mutation ──────────────────────────────────────────────

const CREATE_COLLECTION = `
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
        productsCount {
          count
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Main ───────────────────────────────────────────────────────────

console.log(`\n📁 DLM Collection Creator`);
console.log(`   ${COLLECTIONS.length} collection(s) to create\n`);

if (DRY_RUN) {
  console.log("DRY RUN — listing collections:\n");
  for (const c of COLLECTIONS) {
    console.log(`  ${c.title}`);
    console.log(`    Rules: ${c.ruleSet.rules.map(r => `${r.column} ${r.relation} "${r.condition}"`).join(", ")}`);
  }
  process.exit(0);
}

let created = 0;
let failed = 0;

for (const c of COLLECTIONS) {
  try {
    console.log(`Creating: ${c.title}...`);

    const result = await shopifyGraphQL(CREATE_COLLECTION, {
      input: {
        title: c.title,
        descriptionHtml: c.descriptionHtml,
        ruleSet: c.ruleSet,
      },
    });

    const errors = result.collectionCreate.userErrors;
    if (errors.length > 0) {
      console.log(`  ✗ ${errors.map(e => e.message).join(", ")}`);
      failed++;
      continue;
    }

    const collection = result.collectionCreate.collection;
    console.log(`  ✓ Created "${collection.title}" (handle: ${collection.handle})`);
    created++;
  } catch (err) {
    console.log(`  ✗ ${c.title} — ${err.message}`);
    failed++;
  }

  await sleep(500);
}

console.log(`\n--- Summary ---`);
console.log(`Created: ${created}`);
console.log(`Failed:  ${failed}`);
