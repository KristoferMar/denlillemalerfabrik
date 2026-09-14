#!/usr/bin/env node
/**
 * Removes tinting from Træbeskyttelse Vandbaseret: the product is sold
 * untinted only, so all colour variants except Råhvid are deleted and the
 * "Farve" option is removed. What remains is Størrelse 5L / 10L at the
 * price list's Base A prices (749 / 1.599 kr), keeping the Råhvid SKUs and
 * the 5L image link created by convert-traebeskyttelse-vandbaseret.js.
 *
 * The `paint` tags are kept so the product still lists under Maling on
 * /produkter; the variant picker only renders paint swatches for an option
 * named "Farve", so it falls back to plain size buttons.
 *
 * Usage:
 *   node scripts/products/remove-traebeskyttelse-vandbaseret-colors.js --dry-run
 *   node scripts/products/remove-traebeskyttelse-vandbaseret-colors.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const HANDLE = "traebeskyttelse-heldaekkende-vandig";
const KEEP_COLOR = "Råhvid";
const EXPECTED_PRICES = { "5L": "749.00", "10L": "1599.00" };

const GET_PRODUCT = `
  query GetProduct($handle: String!, $cursor: String) {
    productByHandle(handle: $handle) {
      id title
      options { id name optionValues { name } }
      variants(first: 250, after: $cursor) {
        nodes { id sku price selectedOptions { name value } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const DELETE_VARIANTS = `
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      userErrors { field message }
    }
  }
`;

const DELETE_OPTIONS = `
  mutation DeleteOptions($productId: ID!, $options: [ID!]!) {
    productOptionsDelete(productId: $productId, options: $options, strategy: DEFAULT) {
      deletedOptionsIds
      userErrors { field message code }
    }
  }
`;

function assertNoErrors(label, errors) {
  if (errors && errors.length) {
    throw new Error(`${label}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

async function fetchProduct() {
  let product = null;
  const variants = [];
  let cursor = null;
  do {
    const { productByHandle: page } = await shopifyGraphQL(GET_PRODUCT, { handle: HANDLE, cursor });
    if (!page) throw new Error(`No product with handle "${HANDLE}"`);
    product ??= page;
    variants.push(...page.variants.nodes);
    cursor = page.variants.pageInfo.hasNextPage ? page.variants.pageInfo.endCursor : null;
  } while (cursor);
  return { ...product, variants };
}

const colorOf = (v) => v.selectedOptions.find((o) => o.name === "Farve")?.value;
const sizeOf = (v) => v.selectedOptions.find((o) => o.name === "Størrelse")?.value;

const product = await fetchProduct();
const farve = product.options.find((o) => o.name === "Farve");
if (!farve) {
  console.log(`${product.title} has no Farve option — nothing to do.`);
  process.exit(0);
}

const keep = product.variants.filter((v) => colorOf(v) === KEEP_COLOR);
const remove = product.variants.filter((v) => colorOf(v) !== KEEP_COLOR);

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}${product.title}: ${product.variants.length} variants`);
console.log(`Keep (${keep.length}):`);
for (const v of keep) console.log(`  ${sizeOf(v).padEnd(4)} ${v.price.padStart(8)}  ${v.sku}`);
console.log(`Delete: ${remove.length} tinted variants, then the Farve option`);

const badPrice = keep.find((v) => EXPECTED_PRICES[sizeOf(v)] !== v.price);
if (keep.length !== Object.keys(EXPECTED_PRICES).length || badPrice) {
  console.error("Kept variants don't match the expected Råhvid 5L/10L at Base A prices — aborting.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("\nDRY RUN — nothing changed.");
  process.exit(0);
}

for (let i = 0; i < remove.length; i += 100) {
  const res = await shopifyGraphQL(DELETE_VARIANTS, {
    productId: product.id,
    variantsIds: remove.slice(i, i + 100).map((v) => v.id),
  });
  assertNoErrors("productVariantsBulkDelete", res.productVariantsBulkDelete.userErrors);
  console.log(`  ✓ deleted ${Math.min(i + 100, remove.length)}/${remove.length}`);
  await sleep(500);
}

const res = await shopifyGraphQL(DELETE_OPTIONS, { productId: product.id, options: [farve.id] });
assertNoErrors("productOptionsDelete", res.productOptionsDelete.userErrors);
console.log("  ✓ Farve option removed");

const after = await fetchProduct();
console.log(`\nDone — ${after.title}: ${after.variants.map((v) => `${sizeOf(v)} ${v.price}`).join(", ")}`);
