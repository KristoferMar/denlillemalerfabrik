#!/usr/bin/env node
/**
 * Sets descriptions for every paint-line glans product from malerbeskrivelser.md.
 *
 * For each product, the markdown bullet list is converted to HTML paragraphs of
 * the form `<p><strong>Label:</strong> value</p>` — no dashes, bold label only.
 *
 * Usage:
 *   node scripts/products/set-paint-descriptions.js --dry-run
 *   node scripts/products/set-paint-descriptions.js
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL, sleep } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MARKDOWN_PATH = resolve(REPO_ROOT, "malerbeskrivelser.md");

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Markdown parsing ───────────────────────────────────────────────

function parseMarkdown(md) {
  const products = [];
  let current = null;

  for (const rawLine of md.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      if (current) products.push(current);
      current = { title: heading[1].trim(), items: [] };
      continue;
    }

    if (/^##\s+/.test(line) || line.trim() === "---") {
      if (current) {
        products.push(current);
        current = null;
      }
      continue;
    }

    if (!current) continue;

    const bullet = line.match(/^-\s+\*\*(.+?):\*\*\s+(.+?)\s*$/);
    if (bullet) {
      current.items.push({ label: bullet[1].trim(), text: bullet[2].trim() });
    }
  }

  if (current) products.push(current);
  return products.filter((p) => p.items.length > 0);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toHtml(product) {
  return product.items
    .map(
      (item) =>
        `<p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.text)}</p>`,
    )
    .join("\n");
}

// ─── GraphQL ────────────────────────────────────────────────────────

const FIND_PRODUCT = `
  query FindProduct($query: String!) {
    products(first: 5, query: $query) {
      nodes { id title handle }
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

async function findProduct(title) {
  // Exact-title match via Shopify's query DSL. Wrap in quotes so special chars
  // (like `&`) don't fragment the search.
  const escaped = title.replace(/"/g, '\\"');
  const data = await shopifyGraphQL(FIND_PRODUCT, {
    query: `title:"${escaped}"`,
  });
  const matches = data.products.nodes.filter((n) => n.title === title);
  return matches[0] ?? null;
}

// ─── Main ───────────────────────────────────────────────────────────

const markdown = readFileSync(MARKDOWN_PATH, "utf-8");
const products = parseMarkdown(markdown);

console.log(`Parsed ${products.length} products from ${MARKDOWN_PATH}\n`);

const plan = [];
for (const product of products) {
  const match = await findProduct(product.title);
  if (!match) {
    plan.push({ title: product.title, status: "NOT FOUND" });
    continue;
  }
  plan.push({
    title: product.title,
    status: "FOUND",
    id: match.id,
    handle: match.handle,
    html: toHtml(product),
  });
}

// Print plan
for (const entry of plan) {
  if (entry.status === "NOT FOUND") {
    console.log(`  ✗ ${entry.title.padEnd(32)} NOT FOUND`);
  } else {
    console.log(`  ✓ ${entry.title.padEnd(32)} → ${entry.handle}`);
  }
}

const missing = plan.filter((p) => p.status === "NOT FOUND");
if (missing.length > 0) {
  console.warn(`\n${missing.length} product(s) have no live match — they will be skipped.`);
}

const applicable = plan.filter((p) => p.status === "FOUND");

if (DRY_RUN) {
  const sample = applicable.find((p) => p.html);
  console.log(`\nDRY RUN — no writes. Sample HTML for ${sample.title}:\n`);
  console.log(sample.html);
  console.log(`\nRe-run without --dry-run to apply.`);
  process.exit(0);
}

console.log(`\nApplying description updates…\n`);

let updated = 0;
for (const entry of applicable) {
  const result = await shopifyGraphQL(UPDATE_PRODUCT, {
    input: { id: entry.id, descriptionHtml: entry.html },
  });
  const errors = result.productUpdate.userErrors;
  if (errors.length > 0) {
    console.error(`  ✗ ${entry.title}: ${errors.map((e) => e.message).join("; ")}`);
    continue;
  }
  console.log(`  ✓ ${entry.title}`);
  updated += 1;
  await sleep(200);
}

console.log(`\nDone. Updated ${updated}/${applicable.length} products.`);
