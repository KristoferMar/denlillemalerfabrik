#!/usr/bin/env node
/**
 * Syncs URL redirects for sortiment products (single-SKU products that
 * don't have color/glans variants — e.g. spartel & forbehandling, rens,
 * epoxy, etc.).
 *
 * For every matching product, creates one redirect:
 *
 *   /qr/{handle}
 *     →  /products/{handle}?variant={10L-variant-id}   (if 10L exists)
 *     →  /products/{handle}                            (otherwise)
 *
 * Idempotent (create / update / leave unchanged).
 *
 * Usage:
 *   # Default: only kategori:spartel-forbehandling
 *   node scripts/redirects/sync-qr-sortiment.js --dry-run
 *   node scripts/redirects/sync-qr-sortiment.js
 *
 *   # Custom category
 *   node scripts/redirects/sync-qr-sortiment.js --category rens
 *
 *   # All sortiment products at once
 *   node scripts/redirects/sync-qr-sortiment.js --category all
 */

import { shopifyGraphQL, shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

const DEFAULT_SIZE = "10L";
const DEFAULT_SIZE_ALT = "10 L"; // some sortiment products use spaced notation
const SLUG_PREFIX = "/qr/";

// ─── CLI ────────────────────────────────────────────────────────────
const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const CATEGORY = flag("--category", "spartel-forbehandling");

// ─── Query products with the right tags ─────────────────────────────
// `sortiment` narrows to the sortiment line; `kategori:X` picks the
// specific category unless category=all.
const tagQuery =
  CATEGORY === "all"
    ? "tag:sortiment"
    : `tag:sortiment AND tag:'kategori:${CATEGORY}'`;

const PRODUCT_FIELDS = `
  id title handle tags
  options { name values }
  variants(first: 50) {
    nodes { id title sku selectedOptions { name value } }
  }
`;

async function fetchAll() {
  const all = [];
  let cursor = null;
  while (true) {
    const data = await shopifyGraphQL(`
      query ($c: String, $q: String!) {
        products(first: 100, after: $c, query: $q) {
          pageInfo { hasNextPage endCursor }
          nodes { ${PRODUCT_FIELDS} }
        }
      }
    `, { c: cursor, q: tagQuery });
    all.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    await sleep(200);
  }
  return all;
}

function parseTags(tags) {
  const parsed = {};
  for (const t of tags) {
    const i = t.indexOf(":");
    if (i !== -1) parsed[t.slice(0, i)] = t.slice(i + 1);
  }
  return parsed;
}

// ─── Build desired redirects ────────────────────────────────────────
function findDefaultVariant(product) {
  const vs = product.variants.nodes;
  // Prefer an explicit 10L / 10 L size variant
  const ten = vs.find((v) =>
    v.selectedOptions.some(
      (o) => o.name === "Størrelse" && (o.value === DEFAULT_SIZE || o.value === DEFAULT_SIZE_ALT)
    )
  );
  if (ten) return ten;
  // Otherwise: first variant (often Default Title for single-SKU products)
  return vs[0] ?? null;
}

function buildDesired(products) {
  const rows = [];
  for (const p of products) {
    const tags = parseTags(p.tags);

    // Safety: never double-up on products already handled by the color flow.
    if (tags["paint-type"] || tags["full-code"]) continue;

    const v = findDefaultVariant(p);
    const path = `${SLUG_PREFIX}${p.handle}`;

    let target = `/products/${p.handle}`;
    if (v) {
      const numericId = v.id.split("/").pop();
      target += `?variant=${numericId}`;
    }

    rows.push({ path, target, product: p, variant: v, category: tags["kategori"] });
  }
  return rows;
}

// ─── Fetch existing /qr/* redirects ─────────────────────────────────
async function fetchExistingRedirects() {
  const all = [];
  let sinceId = 0;
  while (true) {
    const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
    const batch = res.redirects ?? [];
    all.push(...batch);
    if (batch.length < 250) break;
    sinceId = batch[batch.length - 1].id;
  }
  return all.filter((r) => r.path.startsWith(SLUG_PREFIX));
}

// ─── Sync ───────────────────────────────────────────────────────────
const products = await fetchAll();
const desired = buildDesired(products);

console.log(`Category: ${CATEGORY}`);
console.log(`Products scanned:  ${products.length}`);
console.log(`Desired redirects: ${desired.length}\n`);

const existing = await fetchExistingRedirects();
const existingByPath = new Map(existing.map((r) => [r.path, r]));

let created = 0, updated = 0, unchanged = 0, errors = 0;

for (const d of desired) {
  const current = existingByPath.get(d.path);
  const preview = `${d.path}  →  ${d.target}   (${d.product.title})`;

  if (!current) {
    console.log(`  + ${preview}`);
    if (!DRY_RUN) {
      try {
        await shopifyRest(`redirects.json`, {
          method: "POST",
          body: { redirect: { path: d.path, target: d.target } },
        });
        created++;
      } catch (e) {
        console.error(`    ERROR: ${e.message}`);
        errors++;
      }
      await sleep(600);
    } else created++;
  } else if (current.target !== d.target) {
    console.log(`  ~ ${d.path}`);
    console.log(`      old: ${current.target}`);
    console.log(`      new: ${d.target}`);
    if (!DRY_RUN) {
      try {
        await shopifyRest(`redirects/${current.id}.json`, {
          method: "PUT",
          body: { redirect: { id: current.id, path: d.path, target: d.target } },
        });
        updated++;
      } catch (e) {
        console.error(`    ERROR: ${e.message}`);
        errors++;
      }
      await sleep(600);
    } else updated++;
  } else {
    unchanged++;
  }
}

console.log(
  `\n────────\nDone.  created=${created}  updated=${updated}  unchanged=${unchanged}  errors=${errors}${
    DRY_RUN ? "  (dry-run)" : ""
  }`
);
