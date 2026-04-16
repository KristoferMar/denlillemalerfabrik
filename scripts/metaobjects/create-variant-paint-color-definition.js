#!/usr/bin/env node
/**
 * Creates a PRODUCTVARIANT-scoped metafield definition for
 * `custom.paint_color`, referencing the existing `paint_color` metaobject.
 *
 * Required so that `restructure-paint-by-glans.js` can wire each variant to
 * its color metaobject (so the storefront can render swatches per variant).
 *
 * The PRODUCT-scoped definition with the same namespace/key already exists
 * and stays untouched — metafield definitions on different owner types are
 * independent.
 *
 * Idempotent: if the variant-scoped definition already exists, exits cleanly.
 *
 * Usage:
 *   node scripts/metaobjects/create-variant-paint-color-definition.js
 */

import { shopifyGraphQL } from "../shopify-client.js";

// 1. Find the paint_color metaobject definition id (for the validation).
const defQuery = await shopifyGraphQL(`
  { metaobjectDefinitionByType(type: "paint_color") { id name } }
`);

const paintColorDefId = defQuery.metaobjectDefinitionByType?.id;
if (!paintColorDefId) {
  console.error("Could not find paint_color metaobject definition. Aborting.");
  process.exit(1);
}
console.log(`paint_color metaobject definition: ${paintColorDefId}`);

// 2. Check if a PRODUCTVARIANT paint_color definition already exists.
const existing = await shopifyGraphQL(`
  {
    metafieldDefinitions(ownerType: PRODUCTVARIANT, namespace: "custom", first: 50) {
      nodes { id namespace key name type { name } }
    }
  }
`);

const already = existing.metafieldDefinitions.nodes.find((d) => d.key === "paint_color");
if (already) {
  console.log(`Definition already exists: ${already.namespace}.${already.key} (${already.id}) — nothing to do.`);
  process.exit(0);
}

// 3. Create the definition.
const res = await shopifyGraphQL(`
  mutation ($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id namespace key name ownerType type { name } }
      userErrors { field message code }
    }
  }
`, {
  definition: {
    name: "Paint Color",
    namespace: "custom",
    key: "paint_color",
    ownerType: "PRODUCTVARIANT",
    type: "metaobject_reference",
    description: "Paint color metaobject reference, per variant. Drives swatches on PDP.",
    validations: [
      { name: "metaobject_definition_id", value: paintColorDefId },
    ],
  },
});

const out = res.metafieldDefinitionCreate;
if (out.userErrors?.length) {
  console.error("Errors creating definition:");
  for (const e of out.userErrors) {
    console.error(`  ${e.field?.join(".") ?? ""}: ${e.message} (${e.code ?? ""})`);
  }
  process.exit(1);
}

const def = out.createdDefinition;
console.log(`✓ Created: ${def.namespace}.${def.key}  [${def.type.name}]  on ${def.ownerType}`);
console.log(`  id: ${def.id}`);
