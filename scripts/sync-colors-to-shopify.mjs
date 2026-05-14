#!/usr/bin/env node
/**
 * sync-colors-to-shopify.mjs
 *
 * Idempotently syncs docs/colors/dlm-colors-with-ncs.json → Shopify Paint Color metaobjects.
 *
 *   - Reads the JSON (200 records, 6-field data model).
 *   - Queries existing `paint_color` metaobjects.
 *   - For each JSON record:
 *       * If a metaobject with matching `dlm_code` field exists → updates handle + all fields.
 *       * Otherwise → creates a new metaobject with handle = JSON.handle.
 *   - Field mapping JSON → metaobject:
 *       handle      → metaobject handle (e.g. "dlm0203")
 *       dlm_id      → dlm_code      ("DLM0203")
 *       ncs_code    → ncs_code      ("S 2010-B")
 *       name_da     → name          ("Havbrise")
 *       display_hex → hex_color     ("#A3C1CE")
 *       family      → color_family  ("Blues")
 *
 *   - Re-running with no JSON changes makes zero Shopify writes
 *     (handles already match, field values already match).
 *
 * Usage:
 *   SHOPIFY_SHOP=your-shop.myshopify.com \
 *   SHOPIFY_ADMIN_TOKEN=shpat_xxx \
 *   node scripts/sync-colors-to-shopify.mjs
 *
 * Required Admin API scopes: read_metaobjects, write_metaobjects
 *
 * Initial bootstrap (this state was created 2026-05-12 via the Shopify MCP):
 *   - Definition `paint_color` (gid://shopify/MetaobjectDefinition/25049989506)
 *   - Fields: name, dlm_code, hex_color, color_family, ncs_code (single_line_text_field)
 *   - 200 entries populated, handles dlm0101…dlm0825
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JSON_PATH = path.resolve(__dirname, "../docs/colors/dlm-colors-with-ncs.json");

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-01";

if (!SHOP || !TOKEN) {
  console.error("ERROR: SHOPIFY_SHOP and SHOPIFY_ADMIN_TOKEN env vars are required.");
  process.exit(1);
}

const ENDPOINT = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

async function fetchExistingColors() {
  const byDlmCode = new Map(); // dlm_code → { id, handle, fieldsMap }
  let cursor = null;
  while (true) {
    const data = await gql(
      `query ($cursor: String) {
        metaobjects(type: "paint_color", first: 100, after: $cursor) {
          edges {
            node {
              id
              handle
              fields { key value }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor }
    );
    for (const edge of data.metaobjects.edges) {
      const n = edge.node;
      const fieldsMap = Object.fromEntries(n.fields.map((f) => [f.key, f.value]));
      const dlmCode = fieldsMap.dlm_code;
      if (dlmCode) byDlmCode.set(dlmCode, { id: n.id, handle: n.handle, fieldsMap });
    }
    if (!data.metaobjects.pageInfo.hasNextPage) break;
    cursor = data.metaobjects.pageInfo.endCursor;
  }
  return byDlmCode;
}

function jsonRecordToFields(rec) {
  return [
    { key: "name", value: rec.name_da },
    { key: "dlm_code", value: rec.dlm_id },
    { key: "hex_color", value: rec.display_hex },
    { key: "color_family", value: rec.family },
    { key: "ncs_code", value: rec.ncs_code },
  ];
}

function needsUpdate(rec, existing) {
  if (existing.handle !== rec.handle) return true;
  const want = {
    name: rec.name_da,
    dlm_code: rec.dlm_id,
    hex_color: rec.display_hex,
    color_family: rec.family,
    ncs_code: rec.ncs_code,
  };
  for (const [k, v] of Object.entries(want)) {
    if (existing.fieldsMap[k] !== v) return true;
  }
  return false;
}

async function updateMetaobject(id, rec) {
  const data = await gql(
    `mutation ($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message code }
      }
    }`,
    {
      id,
      metaobject: { handle: rec.handle, fields: jsonRecordToFields(rec) },
    }
  );
  const errs = data.metaobjectUpdate.userErrors;
  if (errs.length) throw new Error(`update ${rec.dlm_id}: ${JSON.stringify(errs)}`);
}

async function createMetaobject(rec) {
  const data = await gql(
    `mutation ($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message code }
      }
    }`,
    {
      metaobject: {
        type: "paint_color",
        handle: rec.handle,
        fields: jsonRecordToFields(rec),
      },
    }
  );
  const errs = data.metaobjectCreate.userErrors;
  if (errs.length) throw new Error(`create ${rec.dlm_id}: ${JSON.stringify(errs)}`);
}

// Rebuild the shop-level `custom.paint_palette` list metafield from the
// current set of paint_color metaobjects, ordered to match the JSON
// (i.e. by dlm_id). This is required because Liquid's
// `shop.metaobjects['paint_color']` accessor is capped at 50 entries —
// the theme reads from this list instead. See the home-page section
// `sections/kmeconsulting-product-finder.liquid`.
async function updatePaintPalette(records, existingByDlm) {
  const orderedGids = [];
  const missing = [];
  for (const rec of records) {
    const hit = existingByDlm.get(rec.dlm_id);
    if (!hit) {
      missing.push(rec.dlm_id);
      continue;
    }
    orderedGids.push(hit.id);
  }
  if (missing.length) {
    throw new Error(
      `updatePaintPalette: ${missing.length} records have no Shopify entry yet: ${missing.slice(0, 5).join(", ")}…`
    );
  }

  // Look up the shop GID so the metafield owner is correct.
  const shopData = await gql(`query { shop { id } }`);
  const shopId = shopData.shop.id;

  const data = await gql(
    `mutation ($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key type }
        userErrors { field message code }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: "custom",
          key: "paint_palette",
          type: "list.metaobject_reference",
          value: JSON.stringify(orderedGids),
        },
      ],
    }
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`paint_palette set: ${JSON.stringify(errs)}`);
  return orderedGids.length;
}

async function main() {
  const records = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  console.log(`Loaded ${records.length} records from ${JSON_PATH}`);

  console.log("Fetching existing Paint Color metaobjects…");
  const existing = await fetchExistingColors();
  console.log(`Found ${existing.size} existing entries.`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const rec of records) {
    const hit = existing.get(rec.dlm_id);
    if (hit) {
      if (needsUpdate(rec, hit)) {
        await updateMetaobject(hit.id, rec);
        updated += 1;
        console.log(`  updated ${rec.dlm_id}`);
      } else {
        unchanged += 1;
      }
    } else {
      await createMetaobject(rec);
      created += 1;
      console.log(`  created ${rec.dlm_id}`);
    }
  }

  // Refresh the existing map after creates so the palette list picks up
  // newly-created GIDs. Skipped when no creates happened (a tiny optimisation
  // since `fetchExistingColors` paginates).
  let paletteSource = existing;
  if (created > 0) {
    console.log("Re-fetching metaobject GIDs after creates…");
    paletteSource = await fetchExistingColors();
  }

  console.log("Updating shop.custom.paint_palette list metafield…");
  const paletteSize = await updatePaintPalette(records, paletteSource);
  console.log(`  paint_palette: ${paletteSize} references`);

  console.log("\nDone.");
  console.log(`  created:   ${created}`);
  console.log(`  updated:   ${updated}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  total:     ${records.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
