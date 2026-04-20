#!/usr/bin/env node
/**
 * Audits every product handle referenced by the Malerberegner config
 * (`snippets/beregner-config.liquid`) against the live Shopify catalog.
 *
 * Reports:
 *   - handles that don't resolve to a product (broken)
 *   - handles that start with "TODO-" (placeholders)
 *   - handles that resolve (✓)
 *
 * Usage: node scripts/products/audit-beregner-handles.js
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(REPO_ROOT, "snippets", "beregner-config.liquid");

// ─── Parse config ───────────────────────────────────────────────────

const source = readFileSync(CONFIG_PATH, "utf-8");

// Pull the JSON blob out of the <script id="beregner-config"> tag.
const jsonMatch = source.match(/<script[^>]*id="beregner-config"[^>]*>([\s\S]*?)<\/script>/);
if (!jsonMatch) {
  console.error(`Could not find beregner-config <script> block in ${CONFIG_PATH}`);
  process.exit(1);
}
const config = JSON.parse(jsonMatch[1]);

// Collect every handle used, with context (which treatment + which role).
const references = [];
for (const [treatmentKey, treatment] of Object.entries(config.treatments || {})) {
  for (const [slot, product] of Object.entries(treatment.products || {})) {
    if (!product || typeof product.handle !== "string") continue;
    references.push({
      handle: product.handle,
      treatment: treatmentKey,
      treatmentName: treatment.name,
      slot,
      label: product.label,
      role: product.role,
    });
  }
}

// Dedupe to unique handles to minimise API calls.
const uniqueHandles = [...new Set(references.map((r) => r.handle))];

console.log(`Config parsed: ${references.length} references, ${uniqueHandles.length} unique handles\n`);

// ─── Resolve each handle against Shopify ────────────────────────────

const GET_PRODUCT = `
  query($handle: String!) {
    productByHandle(handle: $handle) { id title handle status }
  }
`;

const resolution = new Map();
for (const handle of uniqueHandles) {
  if (handle.startsWith("TODO-")) {
    resolution.set(handle, { status: "PLACEHOLDER" });
    continue;
  }
  const data = await shopifyGraphQL(GET_PRODUCT, { handle });
  if (data.productByHandle) {
    resolution.set(handle, {
      status: "OK",
      title: data.productByHandle.title,
      productStatus: data.productByHandle.status,
    });
  } else {
    resolution.set(handle, { status: "NOT_FOUND" });
  }
}

// ─── Report ─────────────────────────────────────────────────────────

const byStatus = { OK: [], PLACEHOLDER: [], NOT_FOUND: [] };
for (const handle of uniqueHandles) {
  byStatus[resolution.get(handle).status].push(handle);
}

// Per-reference impact table: which treatment slots are broken, for the customer to act on.
const brokenSlots = references.filter((r) => resolution.get(r.handle).status !== "OK");

console.log(`Unique handle status:`);
console.log(`  🟢 Resolves   : ${byStatus.OK.length}`);
console.log(`  🔴 TODO       : ${byStatus.PLACEHOLDER.length}`);
console.log(`  🟠 Not found  : ${byStatus.NOT_FOUND.length}`);
console.log();

if (byStatus.NOT_FOUND.length > 0) {
  console.log(`── NOT FOUND (handle doesn't exist in Shopify) ─────────`);
  for (const handle of byStatus.NOT_FOUND) {
    console.log(`  ${handle}`);
    const uses = references.filter((r) => r.handle === handle);
    for (const use of uses) {
      console.log(`    ↳ ${use.treatment.padEnd(32)} / ${use.slot.padEnd(12)} (${use.label})`);
    }
  }
  console.log();
}

if (byStatus.PLACEHOLDER.length > 0) {
  console.log(`── TODO placeholders (need a real product) ────────────`);
  for (const handle of byStatus.PLACEHOLDER) {
    const uses = references.filter((r) => r.handle === handle);
    const role = uses[0]?.role ?? "";
    const label = uses[0]?.label ?? "";
    console.log(`  ${handle}  —  role: ${role}, label: "${label}", used in ${uses.length} treatment${uses.length === 1 ? "" : "s"}`);
  }
  console.log();
}

if (byStatus.OK.length > 0) {
  console.log(`── Resolves (${byStatus.OK.length}) ──`);
  for (const handle of byStatus.OK) {
    const r = resolution.get(handle);
    console.log(`  ${handle.padEnd(40)} → ${r.title}${r.productStatus !== "ACTIVE" ? ` [${r.productStatus}]` : ""}`);
  }
  console.log();
}

console.log(`── Treatment coverage ───────────────────────────────────`);
for (const [treatmentKey, treatment] of Object.entries(config.treatments || {})) {
  const slots = Object.entries(treatment.products || {});
  const brokenCount = slots.filter(([, p]) => resolution.get(p.handle).status !== "OK").length;
  const indicator = brokenCount === 0 ? "🟢" : brokenCount === slots.length ? "🔴" : "🟠";
  console.log(`  ${indicator} ${treatmentKey.padEnd(32)} ${slots.length - brokenCount}/${slots.length} ok  (${treatment.name})`);
}

// Non-zero exit when anything is broken, so this can gate CI.
const totalBroken = byStatus.PLACEHOLDER.length + byStatus.NOT_FOUND.length;
if (totalBroken > 0) {
  console.log(`\n${totalBroken} handle(s) need attention.`);
  process.exit(1);
}
console.log(`\nAll handles resolve. ✓`);
