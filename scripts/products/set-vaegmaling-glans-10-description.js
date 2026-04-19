#!/usr/bin/env node
/**
 * Sets the body (descriptionHtml) of the Vægmaling Glans 10 product.
 *
 * Usage:
 *   node scripts/products/set-vaegmaling-glans-10-description.js --dry-run
 *   node scripts/products/set-vaegmaling-glans-10-description.js
 */

import { shopifyGraphQL } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const HANDLE = "vaegmaling-glans-10";

const DESCRIPTION_HTML = `<p>Silkemat vægmaling med den perfekte balance mellem elegance og holdbarhed. Produceret i Danmark til danske hjem.</p>
<h3>Hvorfor vælge Glans 10?</h3>
<ul>
  <li><strong>Dansk produceret</strong> — kort forsyningskæde og tilpasset det danske klima</li>
  <li><strong>Low VOC</strong> — næsten lugtfri og sund indeluft fra dag ét</li>
  <li><strong>Høj dækkeevne</strong> — to strøg er nok, også over mørke farver</li>
  <li><strong>Genanvendelig emballage</strong> — bæredygtigt hele vejen rundt</li>
  <li><strong>Alsidig påføring</strong> — pensel, rulle eller sprøjte</li>
</ul>
<p>10 liter rækker til ca. 80–100 m² pr. strøg. Vandbaseret, overmalbar efter 4 timer.</p>
<p><em>Stor kvalitet fra en lille fabrik.</em></p>`;

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

const data = await shopifyGraphQL(GET_PRODUCT, { handle: HANDLE });
const product = data.productByHandle;

if (!product) {
  console.error(`Product with handle "${HANDLE}" not found.`);
  process.exit(1);
}

console.log(`Product: ${product.title} (${product.id})`);
console.log(`\n── New description HTML ──\n${DESCRIPTION_HTML}\n`);

if (DRY_RUN) {
  console.log(`DRY RUN — no writes. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const result = await shopifyGraphQL(UPDATE_PRODUCT, {
  input: { id: product.id, descriptionHtml: DESCRIPTION_HTML },
});

const errors = result.productUpdate.userErrors;
if (errors.length > 0) {
  console.error(`\nErrors:`);
  for (const e of errors) console.error(`  - ${e.field?.join(".")}: ${e.message}`);
  process.exit(1);
}

console.log(`Done. Updated ${result.productUpdate.product.handle}.`);
