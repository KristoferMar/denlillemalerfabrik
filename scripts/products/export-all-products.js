#!/usr/bin/env node
/**
 * Fetches ALL products from the store (with pagination) and writes them
 * to a Markdown file at the project root: products-export.md
 *
 * Usage:
 *   node scripts/products/export-all-products.js
 *   node scripts/products/export-all-products.js --store <name>
 *   node scripts/products/export-all-products.js --out path/to/file.md
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL, getScriptArgs, sleep } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

// ─── Parse args ─────────────────────────────────────────────────────
const args = getScriptArgs();
const outIdx = args.indexOf("--out");
const outPath =
  outIdx !== -1 && args[outIdx + 1]
    ? resolve(process.cwd(), args[outIdx + 1])
    : resolve(PROJECT_ROOT, "products-export.md");

// ─── Fetch with pagination ──────────────────────────────────────────
const QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        tags
        totalInventory
        onlineStoreUrl
        createdAt
        updatedAt
        description
        options { name values }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
          }
        }
        metafields(first: 25) {
          nodes { namespace key value type }
        }
        collections(first: 25) {
          nodes { handle title }
        }
      }
    }
  }
`;

async function fetchAllProducts() {
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
    await sleep(250); // be polite to the API
  }

  return all;
}

// ─── Markdown rendering ─────────────────────────────────────────────
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function priceRange(p) {
  const pr = p.priceRangeV2;
  if (!pr) return "";
  const min = pr.minVariantPrice;
  const max = pr.maxVariantPrice;
  if (!min || !max) return "";
  if (min.amount === max.amount) return `${min.amount} ${min.currencyCode}`;
  return `${min.amount}–${max.amount} ${min.currencyCode}`;
}

function renderProduct(p) {
  const lines = [];
  lines.push(`## ${p.title}`);
  lines.push("");
  lines.push(`- **Handle:** \`${p.handle}\``);
  lines.push(`- **ID:** \`${p.id}\``);
  lines.push(`- **Status:** ${p.status}`);
  if (p.vendor) lines.push(`- **Vendor:** ${p.vendor}`);
  if (p.productType) lines.push(`- **Type:** ${p.productType}`);
  const price = priceRange(p);
  if (price) lines.push(`- **Price:** ${price}`);
  if (p.totalInventory != null)
    lines.push(`- **Total inventory:** ${p.totalInventory}`);
  if (p.onlineStoreUrl) lines.push(`- **URL:** ${p.onlineStoreUrl}`);
  if (p.tags?.length) lines.push(`- **Tags:** ${p.tags.join(", ")}`);
  if (p.collections?.nodes?.length) {
    const cols = p.collections.nodes
      .map((c) => `${c.title} (\`${c.handle}\`)`)
      .join(", ");
    lines.push(`- **Collections:** ${cols}`);
  }
  lines.push(`- **Created:** ${p.createdAt}`);
  lines.push(`- **Updated:** ${p.updatedAt}`);
  lines.push("");

  if (p.description?.trim()) {
    lines.push(`**Description:**`);
    lines.push("");
    lines.push(p.description.trim());
    lines.push("");
  }

  if (p.options?.length) {
    lines.push(`**Options:**`);
    lines.push("");
    for (const o of p.options) {
      lines.push(`- ${o.name}: ${o.values.join(", ")}`);
    }
    lines.push("");
  }

  const variants = p.variants?.nodes ?? [];
  if (variants.length) {
    lines.push(`**Variants (${variants.length}):**`);
    lines.push("");
    lines.push(`| Title | SKU | Price | Inventory |`);
    lines.push(`|---|---|---|---|`);
    for (const v of variants) {
      lines.push(
        `| ${esc(v.title)} | ${esc(v.sku)} | ${esc(v.price)} | ${esc(v.inventoryQuantity)} |`
      );
    }
    lines.push("");
  }

  const mfs = p.metafields?.nodes ?? [];
  if (mfs.length) {
    lines.push(`**Metafields (${mfs.length}):**`);
    lines.push("");
    lines.push(`| Namespace.Key | Type | Value |`);
    lines.push(`|---|---|---|`);
    for (const m of mfs) {
      lines.push(
        `| \`${m.namespace}.${m.key}\` | ${esc(m.type)} | ${esc(m.value)} |`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function renderMarkdown(products) {
  const now = new Date().toISOString();
  const header = [
    `# Products Export`,
    "",
    `- **Exported:** ${now}`,
    `- **Total products:** ${products.length}`,
    "",
    `## Table of contents`,
    "",
    ...products.map((p, i) => `${i + 1}. [${p.title}](#${slug(p.title)})`),
    "",
    `---`,
    "",
  ].join("\n");

  const body = products.map(renderProduct).join("\n");
  return header + body;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ─── Main ───────────────────────────────────────────────────────────
const products = await fetchAllProducts();

if (products.length === 0) {
  console.log("No products found.");
  process.exit(0);
}

const md = renderMarkdown(products);
writeFileSync(outPath, md, "utf-8");
console.log(`\nWrote ${products.length} products to ${outPath}`);
