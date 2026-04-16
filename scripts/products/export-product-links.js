#!/usr/bin/env node
/**
 * Fetches every product handle + title and writes a Markdown list of
 * storefront URLs, suitable for turning into QR codes.
 *
 * Usage:
 *   node scripts/products/export-product-links.js
 *   node scripts/products/export-product-links.js --store <name>
 *   node scripts/products/export-product-links.js --base https://denlillemalerfabrik.dk
 *   node scripts/products/export-product-links.js --out path/to/file.md
 *   node scripts/products/export-product-links.js --format csv
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL, getScriptArgs, sleep } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

// ─── Parse args ─────────────────────────────────────────────────────
const args = getScriptArgs();

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = flag("--base", "https://den-lille-malerfabrik.myshopify.com").replace(/\/+$/, "");
const FORMAT = flag("--format", "md"); // "md" | "csv" | "txt"
const defaultOut = {
  md: "product-links.md",
  csv: "product-links.csv",
  txt: "product-links.txt",
}[FORMAT] ?? "product-links.md";
const OUT = resolve(process.cwd(), flag("--out", resolve(PROJECT_ROOT, defaultOut)));

// ─── Fetch ──────────────────────────────────────────────────────────
const QUERY = `
  query ProductHandles($cursor: String) {
    products(first: 250, after: $cursor, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle status }
    }
  }
`;

async function fetchAll() {
  const all = [];
  let cursor = null;
  let page = 0;
  while (true) {
    page++;
    process.stdout.write(`Fetching page ${page}… `);
    const data = await shopifyGraphQL(QUERY, { cursor });
    const { nodes, pageInfo } = data.products;
    all.push(...nodes);
    console.log(`got ${nodes.length} (total ${all.length})`);
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
    await sleep(200);
  }
  return all;
}

// ─── Rendering ──────────────────────────────────────────────────────
function urlFor(handle) {
  return `${BASE}/products/${handle}`;
}

function renderMarkdown(products) {
  const now = new Date().toISOString();
  const lines = [
    `# Product Links`,
    "",
    `- **Base URL:** ${BASE}`,
    `- **Exported:** ${now}`,
    `- **Total products:** ${products.length}`,
    "",
    `| # | Title | Status | URL |`,
    `|---|---|---|---|`,
  ];
  products.forEach((p, i) => {
    const url = urlFor(p.handle);
    lines.push(`| ${i + 1} | ${p.title.replace(/\|/g, "\\|")} | ${p.status} | [${url}](${url}) |`);
  });
  lines.push("");
  return lines.join("\n");
}

function renderCsv(products) {
  const lines = [`title,handle,status,url`];
  for (const p of products) {
    const title = `"${p.title.replace(/"/g, '""')}"`;
    lines.push(`${title},${p.handle},${p.status},${urlFor(p.handle)}`);
  }
  return lines.join("\n") + "\n";
}

function renderTxt(products) {
  return products.map((p) => urlFor(p.handle)).join("\n") + "\n";
}

// ─── Main ───────────────────────────────────────────────────────────
const products = await fetchAll();

if (products.length === 0) {
  console.log("No products found.");
  process.exit(0);
}

let output;
if (FORMAT === "csv") output = renderCsv(products);
else if (FORMAT === "txt") output = renderTxt(products);
else output = renderMarkdown(products);

writeFileSync(OUT, output, "utf-8");
console.log(`\nWrote ${products.length} links to ${OUT}`);
