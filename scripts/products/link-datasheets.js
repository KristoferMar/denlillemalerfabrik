#!/usr/bin/env node
/**
 * Uploads the safety data sheets in docs/products/paint/datablade to Shopify
 * Files and links each one at the bottom of the matching product descriptions.
 *
 * The PDFs are Sikkerhedsdatablade (SDS) from Lars Frey Farve & Lak / Den
 * Lille Malerfabrik; the mapping below was checked against the "Handelsnavn"
 * and "Produkt-nr." on page 1 of each sheet, not just the filename.
 *
 * Idempotent: a file is uploaded once (looked up by filename in Shopify Files),
 * and a product whose description already links that file is left alone.
 *
 * Usage:
 *   node scripts/products/link-datasheets.js --dry-run
 *   node scripts/products/link-datasheets.js
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASHEET_DIR = resolve(__dirname, "../../docs/products/paint/datablade");
const DRY_RUN = process.argv.includes("--dry-run");

// PDF filename → product handles it documents.
const DATASHEETS = {
  // SDS "Vægmaling glans 5" (181). The Glans 5 bucket is printed VÆG & LOFT and
  // is the same tin sold under both products.
  "181_Vaegmaling_Glans_5_Den_Lille_Malerfabrik.pdf": ["vaegmaling-glans-5", "loftmaling-glans-5"],
  "183_Vaegmaling_Glans_10_Den_Lille_Malerfabrik.pdf": ["vaegmaling-glans-10"],
  "186_Koekken_og_Bad_Glans_25_Den_Lille_Malerfabrik.pdf": ["vaegmaling-kokken-bad-glans-25"],
  "187_Acryl_emajle_Glans_40_Den_Lille_Malerfabrik.pdf": ["akryl-emalie-glans-40"],
  "441_Microdispers_Den_Lille_Malerfabrik.pdf": ["microdispers-blatonet-inde-ude"],
  "561-562_PU_Gulvlak_Den_Lille_Malerfabrik.pdf": ["pu-gulvlak"],
  "791_Heldaekkende_Oliebaseret_Traebeskyttelse_Den_Lille_Malerfabrik.pdf": ["traebeskyttelse-heldaekkende-alkyd-olie"],
  "810_Heldaekkende_Vandig_Traebeskyttelse_Den_Lille_Malerfabrik.pdf": ["traebeskyttelse-heldaekkende-vandig"],
};

// ─── GraphQL ───────────────────────────────────────────────────────────────

const FIND_FILE = `
  query FindFile($q: String!) {
    files(first: 5, query: $q) { nodes { id ... on GenericFile { url } } }
  }
`;

const STAGED_UPLOAD = `
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id }
      userErrors { field message }
    }
  }
`;

const FILE_STATUS = `
  query FileStatus($id: ID!) {
    node(id: $id) { ... on GenericFile { fileStatus url fileErrors { message } } }
  }
`;

const GET_PRODUCT = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) { id title descriptionHtml }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) { userErrors { field message } }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertNoErrors(label, errors) {
  if (errors && errors.length) {
    throw new Error(`${label}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

// Shopify appends a suffix on duplicate names, so match on the stem.
const stem = (filename) => filename.replace(/\.pdf$/i, "");

async function findUploadedUrl(filename) {
  const { files } = await shopifyGraphQL(FIND_FILE, { q: `filename:${stem(filename)}*` });
  return files.nodes.find((f) => f.url && decodeURIComponent(f.url).includes(stem(filename)))?.url ?? null;
}

async function uploadPdf(filename) {
  const buffer = readFileSync(resolve(DATASHEET_DIR, filename));
  const staged = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [{ resource: "FILE", filename, mimeType: "application/pdf", fileSize: String(buffer.length), httpMethod: "POST" }],
  });
  assertNoErrors("stagedUploadsCreate", staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok && res.status !== 201) throw new Error(`Upload failed: ${res.status}`);

  const created = await shopifyGraphQL(FILE_CREATE, {
    files: [{ originalSource: target.resourceUrl, contentType: "FILE", filename }],
  });
  assertNoErrors("fileCreate", created.fileCreate.userErrors);
  const id = created.fileCreate.files[0].id;

  // The CDN URL only exists once Shopify has processed the file.
  for (let i = 0; i < 60; i++) {
    const { node } = await shopifyGraphQL(FILE_STATUS, { id });
    if (node?.fileStatus === "READY" && node.url) return node.url;
    if (node?.fileStatus === "FAILED") throw new Error(`File failed: ${node.fileErrors?.[0]?.message}`);
    await sleep(2000);
  }
  throw new Error(`${filename} not READY after 120s`);
}

function datasheetBlock(url) {
  return `<p><strong>Dokumentation:</strong><br>• <a href="${url}" target="_blank" rel="noopener">Sikkerhedsdatablad (PDF)</a></p>`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Linking safety data sheets\n`);

for (const [filename, handles] of Object.entries(DATASHEETS)) {
  console.log(filename);
  let url = await findUploadedUrl(filename);
  if (url) {
    console.log(`  file already in Shopify`);
  } else if (DRY_RUN) {
    console.log(`  would upload`);
  } else {
    url = await uploadPdf(filename);
    console.log(`  ✓ uploaded`);
  }

  for (const handle of handles) {
    const { productByHandle: product } = await shopifyGraphQL(GET_PRODUCT, { handle });
    if (!product) {
      console.log(`  ✗ ${handle}: product not found`);
      continue;
    }
    if (product.descriptionHtml.includes(stem(filename))) {
      console.log(`  • ${product.title}: already linked`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  • ${product.title}: would append link (${product.descriptionHtml ? "after existing text" : "description is empty"})`);
      continue;
    }
    const descriptionHtml = [product.descriptionHtml, datasheetBlock(url)].filter(Boolean).join("\n");
    const res = await shopifyGraphQL(UPDATE_PRODUCT, { product: { id: product.id, descriptionHtml } });
    assertNoErrors("productUpdate", res.productUpdate.userErrors);
    console.log(`  ✓ ${product.title}: linked`);
    await sleep(300);
  }
  console.log();
}

console.log(DRY_RUN ? "DRY RUN — nothing changed." : "Done.");
