#!/usr/bin/env node
/**
 * Syncs /qr/* URL redirects for the new (paint-type, glans)-per-product
 * catalog model.
 *
 * For every paint-tagged product (excluding specialblanding), generates one
 * redirect per Farve at the default size:
 *
 *   /qr/{full-code-lowercased}-g{glans}
 *     →  /products/{handle}?variant={10L-variant-id}
 *
 * where `full-code` = `DLM{paint-type-prefix}-{color-code-digits}`
 * (e.g. `DLM10-0101`), and the variant is the one with
 * Farve=<that color> × Størrelse=10L.
 *
 * The color-code digits come from the variant's `custom.paint_color`
 * metafield (metaobject reference → `dlm_code` field).
 *
 * Behavior:
 *   - Creates slugs that don't exist yet
 *   - Updates slugs whose target changed (e.g. handle or variant id)
 *   - Leaves slugs unchanged if already correct
 *   - With --prune: deletes stray /qr/dlm*-g*  slugs that no longer map
 *     to a current product variant (never touches sortiment slugs)
 *   - Aborts on any API error (refuses to continue past failures)
 *
 * Usage:
 *   # Preview — no writes
 *   node scripts/redirects/sync-qr-redirects.js --dry-run
 *
 *   # Scope to a single product for quick iteration
 *   node scripts/redirects/sync-qr-redirects.js --product vaegmaling-glans-5
 *
 *   # Apply — create/update only
 *   node scripts/redirects/sync-qr-redirects.js
 *
 *   # Apply + delete stray paint-shaped slugs that no longer match
 *   node scripts/redirects/sync-qr-redirects.js --prune
 *
 *   # Dry-run prune only (no writes; preview deletions)
 *   node scripts/redirects/sync-qr-redirects.js --prune --dry-run
 */

import { shopifyGraphQL, shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

// ─── Config ─────────────────────────────────────────────────────────
const DEFAULT_SIZE = "10L";
const SLUG_PREFIX = "/qr/";
// Regex for "paint color"-shaped slugs: /qr/dlmTT-FFSS-gN  (any lowercase)
const PAINT_SLUG_RE = /^\/qr\/dlm\d{2}-\d{4}-g\d+$/;

// ─── CLI ────────────────────────────────────────────────────────────
const args = getScriptArgs();
const DRY_RUN = args.includes("--dry-run");
const PRUNE = args.includes("--prune");
const productIdx = args.indexOf("--product");
const HANDLE = productIdx !== -1 ? args[productIdx + 1] : null;

// ─── GraphQL field set ──────────────────────────────────────────────
// Pull the variant-level custom.paint_color metafield reference's dlm_code
// directly, so we don't need a separate metaobject lookup step.
const PRODUCT_FIELDS = `
  id title handle tags
  options { name values }
  variants(first: 250) {
    nodes {
      id
      title
      selectedOptions { name value }
      metafield(namespace: "custom", key: "paint_color") {
        reference {
          ... on Metaobject {
            handle
            dlm_code: field(key: "dlm_code") { value }
          }
        }
      }
    }
  }
`;

// ─── Fetch target products ─────────────────────────────────────────
async function fetchProducts() {
  if (HANDLE) {
    const data = await shopifyGraphQL(
      `query ($h: String!) { productByHandle(handle: $h) { ${PRODUCT_FIELDS} } }`,
      { h: HANDLE }
    );
    return data.productByHandle ? [data.productByHandle] : [];
  }

  const all = [];
  let cursor = null;
  while (true) {
    const data = await shopifyGraphQL(`
      query ($c: String) {
        products(first: 100, after: $c, query: "tag:paint AND -tag:specialblanding") {
          pageInfo { hasNextPage endCursor }
          nodes { ${PRODUCT_FIELDS} }
        }
      }
    `, { c: cursor });
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

// ─── Build desired redirects from product state ────────────────────
function buildDesiredRedirects(products) {
  const desired = [];
  const warnings = [];

  for (const p of products) {
    const tags = parseTags(p.tags);
    const prefix = tags["paint-type-prefix"];
    const glans = tags["glans"];

    if (!prefix) { warnings.push(`${p.handle}: missing paint-type-prefix tag — skipped`); continue; }
    if (!glans)  { warnings.push(`${p.handle}: missing glans tag — skipped`); continue; }

    const hasFarve = p.options.some((o) => o.name === "Farve");
    const hasStr   = p.options.some((o) => o.name === "Størrelse");
    if (!hasFarve || !hasStr) {
      warnings.push(`${p.handle}: missing Farve or Størrelse option — skipped`);
      continue;
    }

    for (const v of p.variants.nodes) {
      const opts = Object.fromEntries(v.selectedOptions.map((s) => [s.name, s.value]));
      if (opts["Størrelse"] !== DEFAULT_SIZE) continue; // only emit one redirect per color

      const dlmCode = v.metafield?.reference?.dlm_code?.value;
      if (!dlmCode) {
        warnings.push(`${p.handle} / ${opts["Farve"]}: variant has no custom.paint_color → dlm_code — skipped`);
        continue;
      }
      const colorDigits = dlmCode.replace(/^DLM/, ""); // "0101"
      const numericId = v.id.split("/").pop();

      desired.push({
        path: `${SLUG_PREFIX}dlm${prefix}-${colorDigits}-g${glans}`,
        target: `/products/${p.handle}?variant=${numericId}`,
        meta: { handle: p.handle, color: opts["Farve"], glans, prefix, dlmCode },
      });
    }
  }

  // Safety: detect duplicate desired slugs (same (prefix, color, glans) appearing twice).
  const byPath = new Map();
  for (const d of desired) {
    if (byPath.has(d.path)) {
      warnings.push(
        `DUPLICATE slug ${d.path}: ${byPath.get(d.path).handle} vs ${d.meta.handle} — second ignored`
      );
    } else byPath.set(d.path, d.meta);
  }
  const unique = [...byPath.entries()].map(([path, meta]) => {
    const d = desired.find((x) => x.path === path);
    return d;
  });

  return { desired: unique, warnings };
}

// ─── Fetch existing /qr/* redirects via REST ───────────────────────
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

async function createRedirect({ path, target }) {
  return shopifyRest("redirects.json", {
    method: "POST",
    body: { redirect: { path, target } },
  });
}

async function updateRedirect(id, { path, target }) {
  return shopifyRest(`redirects/${id}.json`, {
    method: "PUT",
    body: { redirect: { id, path, target } },
  });
}

async function deleteRedirect(id) {
  return shopifyRest(`redirects/${id}.json`, { method: "DELETE" });
}

// ─── Sync ──────────────────────────────────────────────────────────
console.log(DRY_RUN ? "─── DRY-RUN: no writes will happen ───\n" : "─── LIVE RUN ───\n");

const products = await fetchProducts();
if (products.length === 0) {
  console.log("No paint products found.");
  process.exit(0);
}
console.log(`Paint products loaded: ${products.length}`);

const { desired, warnings } = buildDesiredRedirects(products);
console.log(`Desired redirects:     ${desired.length}`);
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings.slice(0, 20)) console.log(`  ${w}`);
  if (warnings.length > 20) console.log(`  … +${warnings.length - 20} more`);
}

const existing = await fetchExistingRedirects();
console.log(`\nLive /qr/* redirects: ${existing.length}`);
const existingByPath = new Map(existing.map((r) => [r.path, r]));
const desiredByPath = new Map(desired.map((d) => [d.path, d]));

let created = 0, updated = 0, unchanged = 0, deleted = 0, errors = 0;
const failures = [];

// ─── Creates & updates ─────────────────────────────────────────────
console.log(`\n── Creating / updating ──`);
for (const d of desired) {
  const current = existingByPath.get(d.path);

  if (!current) {
    console.log(`  + ${d.path}  →  ${d.target}`);
    if (DRY_RUN) { created++; continue; }
    try { await createRedirect(d); created++; }
    catch (e) {
      errors++;
      failures.push({ op: "create", path: d.path, msg: e.message });
      console.error(`    ✗ ERROR: ${e.message}`);
      console.error(`\n  Aborting — refusing to continue past errors.`);
      break;
    }
    await sleep(600);
  } else if (current.target !== d.target) {
    console.log(`  ~ ${d.path}`);
    console.log(`      old: ${current.target}`);
    console.log(`      new: ${d.target}`);
    if (DRY_RUN) { updated++; continue; }
    try { await updateRedirect(current.id, d); updated++; }
    catch (e) {
      errors++;
      failures.push({ op: "update", path: d.path, msg: e.message });
      console.error(`    ✗ ERROR: ${e.message}`);
      console.error(`\n  Aborting — refusing to continue past errors.`);
      break;
    }
    await sleep(600);
  } else {
    unchanged++;
  }
}

// ─── Prune paint-shaped slugs that no longer map to a product ──────
if (PRUNE && errors === 0) {
  console.log(`\n── Pruning stray paint-shaped slugs ──`);
  const strays = existing.filter((r) =>
    PAINT_SLUG_RE.test(r.path) && !desiredByPath.has(r.path)
  );

  if (strays.length === 0) {
    console.log(`  (none found)`);
  } else {
    for (const r of strays) {
      // If scoped to one product, only prune strays whose *current* target
      // references that handle, to avoid touching unrelated QR codes.
      if (HANDLE && !r.target.includes(`/products/${HANDLE}`)) continue;

      console.log(`  - ${r.path}  (was: ${r.target})`);
      if (DRY_RUN) { deleted++; continue; }
      try { await deleteRedirect(r.id); deleted++; }
      catch (e) {
        errors++;
        failures.push({ op: "delete", path: r.path, msg: e.message });
        console.error(`    ✗ ERROR: ${e.message}`);
        console.error(`\n  Aborting — refusing to continue past errors.`);
        break;
      }
      await sleep(600);
    }
  }
}

// ─── Summary ───────────────────────────────────────────────────────
console.log(
  `\n────────\nDone.  created=${created}  updated=${updated}  unchanged=${unchanged}` +
    (PRUNE ? `  deleted=${deleted}` : ``) +
    `  errors=${errors}${DRY_RUN ? "  (dry-run)" : ""}`
);

if (failures.length) {
  console.log(`\nFailure detail:`);
  for (const f of failures) console.log(`  [${f.op}] ${f.path} — ${f.msg}`);
  process.exit(1);
}
