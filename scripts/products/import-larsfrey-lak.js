#!/usr/bin/env node
/**
 * Imports the lacquers and industrial coatings from larsfrey.com
 * (https://larsfrey.com/pages/lars-frey-farve-lak) into Den Lille Malerfabrik.
 *
 * larsfrey.com is a catalogue: every product there is a single 0 kr
 * "Default Title" variant. Text and images are read live from its public
 * product JSON (/products/{handle}.json); sizes and prices come from
 * DLM_fuld_prisliste_alle_produkter.numbers (Vejl. udsalgspris, lines #116–143).
 *
 *   - Products with price-list lines are created ACTIVE with a Størrelse option
 *     and published to the Online Store.
 *   - LF-Industry Primer, LF-KlarLak and LF-Spær Coat have no price-list lines;
 *     they're created as DRAFT without sizes until prices exist.
 *   - AquaWrite (also on the page) was imported from WriteWall instead —
 *     see import-writewall-aquawrite.js.
 *
 * All products get the tag "lak-industri", which drives the "Lak & industri"
 * category on /produkter.
 *
 * Usage:
 *   node scripts/products/import-larsfrey-lak.js --dry-run
 *   node scripts/products/import-larsfrey-lak.js
 *   node scripts/products/import-larsfrey-lak.js --refresh-descriptions
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
// Re-applies the cleaned larsfrey.com description to products that already exist.
const REFRESH_DESCRIPTIONS = process.argv.includes("--refresh-descriptions");
const SOURCE = "https://larsfrey.com";
const VENDOR = "Lars Frey Farve og Lak"; // matches the existing Lars Frey tilbehør products
const PRODUCT_TYPE = "Lak & industri";
const ONLINE_STORE_PUBLICATION = "Online Store";

// Sizes → "Vejl. udsalgspris" (DKK, inkl. moms). null = not on the price list.
const PRODUCTS = [
  { handle: "lf-yacht-lak", unit: "L", sizes: { "2,5 L": 700, "5 L": 1350, "10 L": 2500 } }, // #116–118
  { handle: "lf-model-lak", unit: "L", sizes: { "2,5 L": 700, "5 L": 1350, "20 L": 5400 } }, // #119–121
  // #122–126. #125 (20 L) has no product name on the list; it sits between
  // the Festivals Lak rows, so it's assumed to be Festival lak.
  { handle: "lf-festival-lak", unit: "L", sizes: { "2,5 L": 700, "5 L": 1350, "10 L": 2500, "20 L": 5400, "200 L": 40000 } },
  // #127–131 "LF Beton Forsegler" — confirmed 2026-09-14 to be the same product.
  { handle: "p-d-betonsealer", unit: "L", sizes: { "2,5 L": 700, "5 L": 1350, "10 L": 2500, "20 L": 5400, "200 L": 40000 } },
  // #132–140 (A + B). The price list says KG; changed to liters 2026-09-14 on
  // the merchant's instruction ("kg is wrong"), prices unchanged. The
  // larsfrey.com size sentence is rewritten to match — see SIZE_SENTENCE.
  { handle: "container-maling-2k", unit: "L", sizes: { "3 L": 1100, "5 L": 1800, "20 L": 4400 } },
  { handle: "lf-maskine-maling-2k", unit: "L", sizes: { "3 L": 1100, "5 L": 1800, "20 L": 4400 } },
  { handle: "lf-one-coat", unit: "L", sizes: { "3 L": 1100, "5 L": 1800, "20 L": 4400 } },
  { handle: "lf-anti-grafitti", unit: "L", sizes: { "2,5 L": 700, "5 L": 1350, "20 L": 5400 } }, // #141–143
  { handle: "industry-primer", unit: "L", sizes: null },
  { handle: "klarlak", unit: "L", sizes: null },
  { handle: "spaer-coat", unit: "L", sizes: null },
];

// ─── GraphQL ───────────────────────────────────────────────────────────────

const LOOKUP = `
  query Lookup($handle: String!) {
    productByHandle(handle: $handle) { id }
    publications(first: 20) { nodes { id name } }
  }
`;

const CREATE_PRODUCT = `
  mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_DESCRIPTION = `
  mutation UpdateDescription($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      userErrors { field message }
    }
  }
`;

const PUBLISH = `
  mutation Publish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertNoErrors(label, errors) {
  if (errors && errors.length) {
    throw new Error(`${label}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

async function fetchSource(handle) {
  const res = await fetch(`${SOURCE}/products/${handle}.json`);
  if (!res.ok) throw new Error(`larsfrey.com ${handle}: HTTP ${res.status}`);
  return (await res.json()).product;
}

// The larsfrey.com copy carries rich-text editor residue: <meta charset> tags
// dropped mid-word ("H<meta></strong>…<strong>ærder"), data-mce-fragment
// attributes, inline font-size styles and empty blocks. Strip the residue
// only; the wording is kept as published.
// larsfrey.com lists "5, 10, 20 liters spande og 200 liters tromler" on the
// 2K products, which the shop doesn't sell; replaced with the real sizes.
const SIZE_SENTENCE = /Leveres i 5 liters, 10 liters, 20 liters spande og 200 liters tromler\s*[-.]\s*Hertil leveres hærder\.?/;

function cleanHtml(html) {
  return (html || "")
    .replace(SIZE_SENTENCE, "Leveres i 3 L, 5 L og 20 L. Hertil leveres hærder.")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\s+data-mce-[a-z-]+="[^"]*"/gi, "")
    .replace(/\s+style="[^"]*"/gi, "")
    .replace(/<\/strong>(\s*<span>)?\s*<strong>/gi, "$1") // rejoin "H" + "ærder"
    // A space-only span is the gap between a label and its value ("Nr.: 13-…").
    .replace(/<span>\s*(&nbsp;|\u00a0)?\s*<\/span>/gi, " ")
    .replace(/<(div|p)>\s*(&nbsp;|\u00a0)?\s*<\/\1>/gi, "")
    .replace(/([Hh])(<\/span>)?[\s\u00a0]+(<span>)?\u00e6rder/g, "$1$2$3\u00e6rder") // "1 del h  \u00e6rder" in the mixing tables
    .replace(/\ufeff/g, "")
    .trim();
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Importing Lars Frey lak & industri products\n`);

let onlineStoreId = null;
const summary = [];

for (const cfg of PRODUCTS) {
  const src = await fetchSource(cfg.handle);
  const priced = cfg.sizes !== null;
  const status = priced ? "ACTIVE" : "DRAFT";
  const descriptionHtml = cleanHtml(src.body_html);
  const images = src.images.map((img) => img.src.split("?")[0]);

  console.log(`${src.title}  (${cfg.handle})`);
  console.log(`  ${status}${priced ? " + Online Store" : ""} · ${images.length} images · description ${descriptionHtml.length} chars`);
  if (priced) {
    console.log(`  ${Object.entries(cfg.sizes).map(([s, p]) => `${s} ${p} kr`).join(" · ")}`);
  } else {
    console.log(`  no price-list lines — no sizes`);
  }

  const lookup = await shopifyGraphQL(LOOKUP, { handle: cfg.handle });
  onlineStoreId ??= lookup.publications.nodes.find((p) => p.name === ONLINE_STORE_PUBLICATION)?.id;
  if (lookup.productByHandle && REFRESH_DESCRIPTIONS) {
    if (!DRY_RUN) {
      const res = await shopifyGraphQL(UPDATE_DESCRIPTION, {
        product: { id: lookup.productByHandle.id, descriptionHtml },
      });
      assertNoErrors("productUpdate", res.productUpdate.userErrors);
    }
    console.log(`  ✓ description refreshed\n`);
    summary.push({ title: src.title, result: "description refreshed" });
    continue;
  }
  if (lookup.productByHandle) {
    console.log(`  ✗ already exists — skipping\n`);
    summary.push({ title: src.title, result: "skipped (exists)" });
    continue;
  }
  if (DRY_RUN) {
    console.log();
    continue;
  }

  const created = await shopifyGraphQL(CREATE_PRODUCT, {
    product: {
      title: src.title,
      handle: cfg.handle,
      descriptionHtml,
      vendor: VENDOR,
      productType: PRODUCT_TYPE,
      status,
      tags: ["lak-industri", `enhed:${cfg.unit}`],
      ...(priced && {
        productOptions: [{ name: "Størrelse", values: Object.keys(cfg.sizes).map((name) => ({ name })) }],
      }),
    },
    media: images.map((url) => ({ originalSource: url, mediaContentType: "IMAGE", alt: src.title })),
  });
  assertNoErrors("productCreate", created.productCreate.userErrors);
  const productId = created.productCreate.product.id;
  console.log(`  ✓ created`);

  if (priced) {
    const res = await shopifyGraphQL(CREATE_VARIANTS, {
      productId,
      variants: Object.entries(cfg.sizes).map(([size, price]) => ({
        optionValues: [{ optionName: "Størrelse", name: size }],
        price: String(price),
        inventoryPolicy: "CONTINUE",
        inventoryItem: { tracked: false },
      })),
    });
    assertNoErrors("productVariantsBulkCreate", res.productVariantsBulkCreate.userErrors);
    console.log(`  ✓ ${res.productVariantsBulkCreate.productVariants.length} variants`);

    if (!onlineStoreId) throw new Error(`No "${ONLINE_STORE_PUBLICATION}" publication found`);
    const pub = await shopifyGraphQL(PUBLISH, { id: productId, input: [{ publicationId: onlineStoreId }] });
    assertNoErrors("publishablePublish", pub.publishablePublish.userErrors);
    console.log(`  ✓ published to Online Store`);
  }

  summary.push({ title: src.title, result: priced ? `active, ${Object.keys(cfg.sizes).length} sizes` : "draft, no sizes" });
  console.log();
  await sleep(500);
}

if (DRY_RUN) {
  console.log("DRY RUN — nothing created.");
} else {
  console.log("Summary:");
  for (const s of summary) console.log(`  ${s.title.padEnd(28)} ${s.result}`);
}
