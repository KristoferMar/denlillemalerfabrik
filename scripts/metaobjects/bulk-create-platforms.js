#!/usr/bin/env node
/**
 * Bulk-create color_platform metaobjects in Shopify.
 *
 * These represent the surfaces/environments a paint color
 * is available for (wall-indoor, wall-outdoor, ceiling, floor).
 *
 * Usage:
 *   1. Fill in the PLATFORMS array below.
 *   2. Make sure .env has your store + token.
 *   3. Run:  node bulk-create-platforms.js
 *            node bulk-create-platforms.js --dry-run   (preview only)
 */

import { shopifyGraphQL, sleep, getScriptArgs } from "../shopify-client.js";

// ─── YOUR PLATFORM DATA ─────────────────────────────────────────────
// Adjust the fields to match your color_platform metaobject definition.
// Common fields might be: name, surface_type, environment, description.
// Update the field keys below to match what you've defined in Shopify.

const PLATFORMS = [
  {
    name: "Væg – Indendørs",
    handle: "wall-indoor",
    fields: {
      surface_type: "wall",
      environment: "indoor",
    },
  },
  {
    name: "Væg – Udendørs",
    handle: "wall-outdoor",
    fields: {
      surface_type: "wall",
      environment: "outdoor",
    },
  },
  {
    name: "Loft",
    handle: "ceiling",
    fields: {
      surface_type: "ceiling",
      environment: "indoor",
    },
  },
  {
    name: "Gulv – Indendørs",
    handle: "floor-indoor",
    fields: {
      surface_type: "floor",
      environment: "indoor",
    },
  },
  {
    name: "Gulv – Udendørs",
    handle: "floor-outdoor",
    fields: {
      surface_type: "floor",
      environment: "outdoor",
    },
  },
  {
    name: "Træværk – Indendørs",
    handle: "wood-indoor",
    fields: {
      surface_type: "wood",
      environment: "indoor",
    },
  },
  {
    name: "Træværk – Udendørs",
    handle: "wood-outdoor",
    fields: {
      surface_type: "wood",
      environment: "outdoor",
    },
  },
  {
    name: "Metal",
    handle: "metal",
    fields: {
      surface_type: "metal",
      environment: "both",
    },
  },

  // Add more platforms here...
];

// ─── METAOBJECT TYPE ────────────────────────────────────────────────
const METAOBJECT_TYPE = "color_platform";

// ─── GRAPHQL ────────────────────────────────────────────────────────

const CREATE_MUTATION = `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
        handle
        displayName
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── MAIN ───────────────────────────────────────────────────────────

const dryRun = getScriptArgs().includes("--dry-run");

async function main() {
  console.log(`\n🏗️  Bulk-creating ${PLATFORMS.length} platforms (type: ${METAOBJECT_TYPE})`);
  if (dryRun) console.log("   (DRY RUN — nothing will be created)\n");
  else console.log();

  let created = 0;
  let errors = 0;

  for (const platform of PLATFORMS) {
    const fields = [
      { key: "name", value: platform.name },
      ...Object.entries(platform.fields).map(([key, value]) => ({
        key,
        value,
      })),
    ];

    if (dryRun) {
      console.log(`  [DRY] ${platform.name} → handle: ${platform.handle}`);
      console.log(`         fields: ${JSON.stringify(platform.fields)}`);
      created++;
      continue;
    }

    try {
      const data = await shopifyGraphQL(CREATE_MUTATION, {
        metaobject: {
          type: METAOBJECT_TYPE,
          handle: platform.handle,
          fields,
        },
      });

      const result = data.metaobjectCreate;

      if (result.userErrors.length > 0) {
        console.error(`  ✗ ${platform.name}: ${result.userErrors.map((e) => e.message).join(", ")}`);
        errors++;
      } else {
        console.log(`  ✓ ${platform.name} → ${result.metaobject.handle}`);
        created++;
      }
    } catch (err) {
      console.error(`  ✗ ${platform.name}: ${err.message}`);
      errors++;
    }

    await sleep(500);
  }

  console.log(`\nDone! Created: ${created}, Errors: ${errors}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
