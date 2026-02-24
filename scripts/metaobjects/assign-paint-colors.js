#!/usr/bin/env node
/**
 * Assigns paint_color metafield to products.
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

// ─── Get paint_color metaobjects ─────────────────────────────────────

const colors = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_color", first: 50) {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`);

function findColor(dlmCode) {
  return colors.metaobjects.nodes.find(obj =>
    obj.fields.some(f => f.key === "dlm_code" && f.value === dlmCode)
  );
}

// ─── Ensure metafield definition exists ──────────────────────────────

const defData = await shopifyGraphQL(`
  {
    metaobjectDefinitionByType(type: "paint_color") {
      id
    }
  }
`);

const paintColorDefId = defData.metaobjectDefinitionByType.id;

const createDef = await shopifyGraphQL(`
  mutation CreateMetafieldDef($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message }
    }
  }
`, {
  definition: {
    name: "Paint Color",
    namespace: "custom",
    key: "paint_color",
    type: "metaobject_reference",
    ownerType: "PRODUCT",
    validations: [
      { name: "metaobject_definition_id", value: paintColorDefId }
    ]
  }
});

const defErrors = createDef.metafieldDefinitionCreate.userErrors;
if (defErrors.length > 0) {
  if (defErrors.some(e => e.message.includes("already exists") || e.message.includes("taken") || e.message.includes("in use"))) {
    console.log("Metafield definition already exists, continuing...\n");
  } else {
    console.error("Error:", defErrors);
    process.exit(1);
  }
} else {
  console.log("Metafield definition created: custom.paint_color\n");
}

// ─── Assign colors to products ───────────────────────────────────────

const assignments = [
  { productId: "gid://shopify/Product/15263324635522", title: "Interiør Glans 5",       dlmCode: "DLM0102" },  // Porcelæn
  { productId: "gid://shopify/Product/15263326339458", title: "Interiør glans 10 blå",   dlmCode: "DLM0203" },  // Havbrise
  { productId: "gid://shopify/Product/15263330435458", title: "Loft glans 25",           dlmCode: "DLM0101" },  // Snehvid
  { productId: "gid://shopify/Product/15263304941954", title: "Træ Glans 40",            dlmCode: "DLM0501" },  // Elfenben
];

console.log(`Assigning paint_color to ${assignments.length} products...\n`);

for (const a of assignments) {
  const colorObj = findColor(a.dlmCode);
  if (!colorObj) {
    console.log(`  ✗ ${a.title} — could not find color ${a.dlmCode}`);
    continue;
  }

  const colorName = colorObj.fields.find(f => f.key === "name")?.value;

  const result = await shopifyGraphQL(`
    mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { namespace key value }
        userErrors { field message }
      }
    }
  `, {
    metafields: [{
      ownerId: a.productId,
      namespace: "custom",
      key: "paint_color",
      type: "metaobject_reference",
      value: colorObj.id,
    }]
  });

  const errors = result.metafieldsSet.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${a.title} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${a.title} → ${colorName} (${a.dlmCode})`);
  }

  await sleep(200);
}

console.log("\nDone!");
