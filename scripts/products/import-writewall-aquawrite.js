#!/usr/bin/env node
/**
 * Imports the two AquaWrite whiteboard products from the WriteWall shop
 * (writewall.myshopify.com — same owner) into Den Lille Malerfabrik.
 *
 * Source data (SKUs, weights, images, colour variants) is read live from the
 * WriteWall storefront's public JSON (/products/{handle}.json). Titles and
 * descriptions are Danish translations of the WriteWall copy; nothing is
 * added that the source doesn't say.
 *
 * Prices are DKK "Vejl. udsalgspris" from DLM_fuld_prisliste_alle_produkter
 * (#87–90), the same for Klar and Hvid. WriteWall sells them in EUR (250 / 200).
 *
 * Products are created as DRAFT so the Danish copy can be reviewed first.
 *
 * Usage:
 *   node scripts/products/import-writewall-aquawrite.js --dry-run
 *   node scripts/products/import-writewall-aquawrite.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE = "https://writewall.myshopify.com";
const COLOR_NAMES = { clear: "Klar", white: "Hvid" };
// "whiteboardmaling" drives the Whiteboardmaling category on /produkter.
const COMMON_TAGS = ["sortiment", "kategori:vaegbeklaedning", "enhed:m²", "WriteWall", "AquaWrite", "whiteboardmaling"];

const PRODUCTS = [
  {
    sourceHandle: "5-m2-kit-aquawrite-whiteboard-paint-white-including-white-primer",
    title: "AquaWrite Whiteboardmaling Kit 5 m²",
    // Explicit: Shopify's auto-handle drops "²" and ends in "-5-m".
    handle: "aquawrite-whiteboardmaling-kit-5-m2",
    price: "1895.00", // #87 / #88 WWP AQUAWRITE HIGH PERFORMANCE WHITEBOARD KIT 5M2 WHITE / CLEAR
    descriptionHtml: `<p>AquaWrite er en high performance whiteboardmaling til professionelt brug. Den fås i en klar og en hvid version, så enhver overflade – uanset farve og struktur – kan skrives på. For at komme godt i gang med AquaWrite anbefaler vi AquaWrite whiteboardmaling-kittet. Store drømme har små begyndelser: vores kompakte, men komplette æske giver dig alt, hvad du skal bruge for at starte din kreative rejse.</p>
<ul>
<li><strong>Glans:</strong> 50–60</li>
<li><strong>Udviklet og produceret i Danmark</strong></li>
<li><strong>Garanti:</strong> 10 års garanti mod revner og afskalning</li>
</ul>
<p><a href="https://writewall.myshopify.com/pages/steps-of-installation" target="_blank" rel="noopener"><strong>Installationsvejledning (på engelsk)</strong></a></p>`,
  },
  {
    sourceHandle: "5-m2-aquawrite-whiteboard-paint-clear",
    title: "AquaWrite Whiteboardmaling 5 m²",
    handle: "aquawrite-whiteboardmaling-5-m2",
    price: "1500.00", // #89 / #90 WWP AQUAWRITE HIGH PERFORMANCE WHITEBOARD 5M2 WHITE / CLEAR A + B
    descriptionHtml: `<p><strong>2K vandbaseret high performance whiteboardmaling.</strong></p>
<p><strong>Glans:</strong> 50–60<br><strong>Udviklet og produceret i:</strong> Danmark<br><strong>Garanti:</strong> 10 års garanti mod revner og afskalning.</p>
<p><strong>Egenskaber:</strong></p>
<ul>
<li>Utrolig overflade, der er nem at rengøre og vedligeholde</li>
<li>Branchens hurtigste tørre- og hærdetid: 72 timer</li>
<li>Grunding og påføring samme dag</li>
<li>Ét lag – enkel opsætning</li>
<li>UV-bestandig</li>
<li>Lavt VOC-indhold</li>
</ul>`,
  },
];

// ─── GraphQL ───────────────────────────────────────────────────────────────

const FIND_EXISTING = `
  query Find($query: String!) {
    products(first: 5, query: $query) { nodes { id title handle } }
  }
`;

const CREATE_PRODUCT = `
  mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id handle
        media(first: 10) { nodes { id alt } }
      }
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
      productVariants { id selectedOptions { name value } }
      userErrors { field message }
    }
  }
`;

const MEDIA_STATUS = `
  query MediaStatus($id: ID!) {
    node(id: $id) { ... on MediaImage { status fileErrors { message } } }
  }
`;

const APPEND_VARIANT_MEDIA = `
  mutation AppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
    productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
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
  if (!res.ok) throw new Error(`WriteWall ${handle}: HTTP ${res.status}`);
  return (await res.json()).product;
}

const colorName = (raw) => {
  const name = COLOR_NAMES[raw.trim().toLowerCase()];
  if (!name) throw new Error(`Unknown WriteWall colour "${raw}"`);
  return name;
};

// Shopify processes media asynchronously; variants can't be linked until READY.
async function waitForMediaReady(mediaId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { node } = await shopifyGraphQL(MEDIA_STATUS, { id: mediaId });
    if (node?.status === "READY") return;
    if (node?.status === "FAILED") throw new Error(`Media failed: ${node.fileErrors?.[0]?.message}`);
    await sleep(2000);
  }
  throw new Error(`Media ${mediaId} not READY after ${timeoutMs / 1000}s`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Importing AquaWrite products from WriteWall\n`);

for (const cfg of PRODUCTS) {
  const src = await fetchSource(cfg.sourceHandle);
  const variants = src.variants.map((v) => ({
    color: colorName(v.option1),
    sku: v.sku,
    grams: v.grams,
    sourceId: v.id,
  }));
  const images = src.images.map((img) => {
    const variant = variants.find((v) => img.variant_ids.includes(v.sourceId));
    return { url: img.src.split("?")[0], file: img.src.split("?")[0].split("/").pop(), color: variant?.color ?? null };
  });

  console.log(`${cfg.title}  (from WriteWall: ${src.title})`);
  console.log(`  status DRAFT · vendor WriteWall · type Vægbeklædning`);
  console.log(`  tags: ${COMMON_TAGS.join(", ")}`);
  for (const v of variants) console.log(`  Farve ${v.color.padEnd(5)} ${cfg.price.padStart(8)} kr  ${v.sku}  ${v.grams} g`);
  for (const img of images) console.log(`  image ${img.file}${img.color ? `  → ${img.color}` : ""}`);

  const { products } = await shopifyGraphQL(FIND_EXISTING, { query: `title:'${cfg.title}'` });
  if (products.nodes.some((p) => p.title === cfg.title)) {
    console.log(`  ✗ already exists (${products.nodes[0].handle}) — skipping\n`);
    continue;
  }

  if (DRY_RUN) {
    console.log();
    continue;
  }

  const created = await shopifyGraphQL(CREATE_PRODUCT, {
    product: {
      title: cfg.title,
      handle: cfg.handle,
      descriptionHtml: cfg.descriptionHtml,
      vendor: "WriteWall",
      productType: "Vægbeklædning",
      status: "DRAFT",
      tags: COMMON_TAGS,
      productOptions: [{ name: "Farve", values: variants.map((v) => ({ name: v.color })) }],
    },
    media: images.map((img) => ({ originalSource: img.url, mediaContentType: "IMAGE", alt: cfg.title })),
  });
  assertNoErrors("productCreate", created.productCreate.userErrors);
  const product = created.productCreate.product;
  console.log(`  ✓ created ${product.handle}`);

  const res = await shopifyGraphQL(CREATE_VARIANTS, {
    productId: product.id,
    variants: variants.map((v) => ({
      optionValues: [{ optionName: "Farve", name: v.color }],
      price: cfg.price,
      inventoryPolicy: "CONTINUE",
      inventoryItem: {
        sku: v.sku,
        tracked: false,
        measurement: { weight: { value: v.grams, unit: "GRAMS" } },
      },
    })),
  });
  assertNoErrors("productVariantsBulkCreate", res.productVariantsBulkCreate.userErrors);
  const createdVariants = res.productVariantsBulkCreate.productVariants;
  console.log(`  ✓ ${createdVariants.length} variants`);

  // Media come back in input order, so index i matches images[i].
  const variantMedia = [];
  for (const [i, img] of images.entries()) {
    const media = product.media.nodes[i];
    if (!img.color || !media) continue;
    await waitForMediaReady(media.id);
    const variant = createdVariants.find((v) => v.selectedOptions[0].value === img.color);
    variantMedia.push({ variantId: variant.id, mediaIds: [media.id] });
  }
  if (variantMedia.length) {
    const linked = await shopifyGraphQL(APPEND_VARIANT_MEDIA, { productId: product.id, variantMedia });
    assertNoErrors("productVariantAppendMedia", linked.productVariantAppendMedia.userErrors);
    console.log(`  ✓ ${variantMedia.length} variant images linked`);
  }
  console.log();
  await sleep(500);
}

console.log(DRY_RUN ? "DRY RUN — nothing created." : "Done — review the drafts in Shopify admin, then set them to Active.");
