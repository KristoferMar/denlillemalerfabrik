#!/usr/bin/env node
/**
 * Assigns paint_type and paint_color metafields to products.
 * First creates the metafield definitions if they don't exist.
 *
 * Usage:
 *   node assign-metafield.js
 */

import { shopifyGraphQL } from "../shopify-client.js";

// ─── Step 1: Get paint_type metaobject IDs ───────────────────────────

const paintTypes = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_type", first: 50) {
      nodes {
        id
        handle
        fields {
          key
          value
        }
      }
    }
  }
`);

console.log("\nPaint types available:");
for (const obj of paintTypes.metaobjects.nodes) {
  const name = obj.fields.find(f => f.key === "name")?.value;
  console.log(`  ${name} → ${obj.id}`);
}

// ─── Step 2: Get the metaobject definition ID for paint_type ─────────

const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_type") {
      id
    }
  }
`);

const paintTypeDefId = defData.metaobjectDefinitionByType.id;

// ─── Step 3: Create metafield definition on products ─────────────────

console.log("\nCreating metafield definition: custom.paint_type on products...");

const createDef = await shopifyGraphQL(`
  mutation CreateMetafieldDef($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`, {
  definition: {
    name: "Paint Type",
    namespace: "custom",
    key: "paint_type",
    type: "metaobject_reference",
    ownerType: "PRODUCT",
    validations: [
      {
        name: "metaobject_definition_id",
        value: paintTypeDefId,
      }
    ]
  }
});

const defErrors = createDef.metafieldDefinitionCreate.userErrors;
if (defErrors.length > 0) {
  if (defErrors.some(e => e.message.includes("already exists") || e.message.includes("taken") || e.message.includes("in use"))) {
    console.log("Definition already exists, continuing...");
  } else {
    console.error("Error creating definition:", defErrors);
    process.exit(1);
  }
} else {
  console.log("Definition created: custom.paint_type");
}

// ─── Step 4: Assign paint_type to all products ──────────────────────

function findPaintType(name) {
  return paintTypes.metaobjects.nodes.find(obj =>
    obj.fields.some(f => f.key === "name" && f.value === name)
  );
}

const assignments = [
  { productId: "gid://shopify/Product/15263304941954", title: "Træ Glans 40", paintType: "Træ & Metal" },
  { productId: "gid://shopify/Product/15263324635522", title: "Interiør Glans 5", paintType: "Vægmaling" },
  { productId: "gid://shopify/Product/15263326339458", title: "Interiør glans 10 blå", paintType: "Vægmaling" },
  { productId: "gid://shopify/Product/15263330435458", title: "Loft glans 25", paintType: "Loftmaling" },
];

console.log(`\nAssigning paint_type to ${assignments.length} products...\n`);

for (const a of assignments) {
  const typeObj = findPaintType(a.paintType);
  if (!typeObj) {
    console.log(`  ✗ ${a.title} — could not find "${a.paintType}"`);
    continue;
  }

  const result = await shopifyGraphQL(`
    mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    metafields: [
      {
        ownerId: a.productId,
        namespace: "custom",
        key: "paint_type",
        type: "metaobject_reference",
        value: typeObj.id,
      }
    ]
  });

  const errors = result.metafieldsSet.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${a.title} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${a.title} → ${a.paintType}`);
  }
}

console.log("\nDone!");
