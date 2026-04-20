#!/usr/bin/env node
/**
 * For every broken handle in the Malerberegner config (TODO-* or not-found),
 * searches the live Shopify catalog for plausible replacement products and
 * prints a short-list for review.
 *
 * Matching is keyword-based (role + label tokens). The goal is to get the
 * user to a decision fast — they pick the right handle, we update the config.
 *
 * Usage: node scripts/products/propose-beregner-handles.js
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(REPO_ROOT, "snippets", "beregner-config.liquid");

// Hand-curated keyword/tag search per TODO/broken handle. The keys match the
// handles in beregner-config.liquid exactly; values are a Shopify products
// query string that should narrow the catalog to plausible replacements.
const SEARCH_HINTS = {
  // Outdated paint references ← new catalog
  "interior-glans-5":        "title:*Vægmaling*",
  "loft-glans-25":           "title:*Loftmaling*",
  "trae-glans-40":           "title:*'Træ & Metal Glans 40'*",

  // Sortiment — primers / grunders
  "TODO-primer-indvendig":   "title:*grunder* OR title:*microdispers*",
  "TODO-betonprimer":        "title:*microdispers* OR title:*beton*grunder*",
  "TODO-traegrunder":        "title:*træ*grunder* OR title:*grundingsolie*",
  "TODO-udvendig-traegrunder": "title:*grundingsolie* OR title:*træ*grunder*",
  "TODO-hæftegrunder":       "title:*hæfte* OR title:*microdispers*",
  "TODO-metalprimer":        "title:*metal*primer* OR title:*rustbeskyttelse*",
  "TODO-facadeprimer":       "title:*facade*primer* OR title:*microdispers*",
  "TODO-gulvprimer":         "title:*gulv*primer* OR title:*alkyd*grund*",
  "TODO-industriprimer":     "title:*epoxy*primer*",
  "TODO-tapetklister":       "title:*tapetklister* OR title:*klister*",

  // Sortiment — special paints
  "TODO-facademaling":       "title:*facademaling* OR title:*mur*facade*",
  "TODO-traebekyttelse":     "title:*Træbeskyttelse Glans 20*",
  "TODO-gulvmaling":         "title:*Gulvmaling Glans 40*",
  "TODO-industrigulvmaling": "title:*Gulvmaling Glans 60*",

  // Lars Frey tilbehør — tools
  "TODO-rullehaandtag-25":   "tag:Rullehåndtag",
  "TODO-malerbakke-25":      "tag:Malerbakker",
  "TODO-teleskopstang":      "tag:'Lars Frey' AND (title:*teleskop* OR title:*forlænger* OR title:*stang*)",
  "TODO-rullespand":         "tag:'Lars Frey' AND (title:*rullespand* OR title:*spand*)",
  "TODO-gulvrulle":          "tag:'Lars Frey' AND title:*gulv*",

  // Lars Frey tilbehør — accessories
  "TODO-washi-tape-36":      "tag:'Lars Frey' AND title:*washi*",
  "TODO-afdaekningsfolie":   "tag:'Lars Frey' AND (title:*afdækning* OR title:*folie-mask*)",
  "TODO-outdoor-tape":       "tag:'Lars Frey' AND (title:*UV* OR title:*projekt*washi*)",
  "TODO-sandpapir-120":      "tag:'Lars Frey' AND title:*sandpapir*",
  "TODO-sandpapir-180":      "tag:'Lars Frey' AND title:*sandpapir*",
};

// ─── Parse config to find all broken handles ────────────────────────

const source = readFileSync(CONFIG_PATH, "utf-8");
const jsonMatch = source.match(/<script[^>]*id="beregner-config"[^>]*>([\s\S]*?)<\/script>/);
const config = JSON.parse(jsonMatch[1]);

const references = [];
for (const [treatmentKey, treatment] of Object.entries(config.treatments || {})) {
  for (const [slot, product] of Object.entries(treatment.products || {})) {
    if (product?.handle) {
      references.push({
        handle: product.handle,
        treatment: treatmentKey,
        slot,
        label: product.label,
        role: product.role,
      });
    }
  }
}

const uniqueHandles = [...new Set(references.map((r) => r.handle))];

// Find broken handles (TODO or not-found)
const GET_PRODUCT = `query($handle: String!) { productByHandle(handle: $handle) { id } }`;
const brokenHandles = [];
for (const handle of uniqueHandles) {
  if (handle.startsWith("TODO-")) {
    brokenHandles.push(handle);
    continue;
  }
  const data = await shopifyGraphQL(GET_PRODUCT, { handle });
  if (!data.productByHandle) brokenHandles.push(handle);
}

console.log(`${brokenHandles.length} broken handles to propose replacements for.\n`);

// ─── Search for candidates per broken handle ────────────────────────

const SEARCH_PRODUCTS = `
  query($query: String!) {
    products(first: 5, query: $query) {
      nodes { handle title productType }
    }
  }
`;

for (const handle of brokenHandles) {
  const refs = references.filter((r) => r.handle === handle);
  const primary = refs[0];
  const search = SEARCH_HINTS[handle];

  console.log(`┌─ ${handle}`);
  console.log(`│  role: ${primary.role}, label: "${primary.label}", used in ${refs.length} treatment${refs.length === 1 ? "" : "s"}`);

  if (!search) {
    console.log(`│  (no search hint defined — add one to SEARCH_HINTS)\n`);
    continue;
  }

  try {
    const data = await shopifyGraphQL(SEARCH_PRODUCTS, { query: search });
    const hits = data.products.nodes;
    if (hits.length === 0) {
      console.log(`│  🟠 no candidates matched: ${search}`);
    } else {
      console.log(`│  candidates:`);
      for (const hit of hits) {
        console.log(`│    - ${hit.handle.padEnd(44)} "${hit.title}"`);
      }
    }
  } catch (err) {
    console.log(`│  ✗ search failed: ${err.message}`);
  }
  console.log(`└─\n`);
}
