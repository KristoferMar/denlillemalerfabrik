#!/usr/bin/env node
/**
 * Maps each color_combination's hex colors to the closest paint_color
 * metaobject and assigns the reference fields.
 *
 * Usage:
 *   node assign-paint-color-refs.js --dry-run     Preview mapping
 *   node assign-paint-color-refs.js                Apply mapping
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Helpers ────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function colorDistance(hex1, hex2) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// ─── Step 1: Fetch all paint_color entries ──────────────────────────

console.log("Fetching paint colors...");

const paintData = await shopifyGraphQL(`
  {
    metaobjects(type: "paint_color", first: 50) {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`);

const paintColors = paintData.metaobjects.nodes.map((node) => {
  const get = (key) => node.fields.find((f) => f.key === key)?.value || "";
  return {
    id: node.id,
    name: get("name"),
    dlm_code: get("dlm_code"),
    hex: get("hex_color"),
  };
});

console.log(`Found ${paintColors.length} paint colors.\n`);

// ─── Step 2: Fetch all color_combination entries ────────────────────

console.log("Fetching color combinations...");

const comboData = await shopifyGraphQL(`
  {
    metaobjects(type: "color_combination", first: 50) {
      nodes {
        id
        handle
        fields {
          key
          value
        }
      }
    }
  }
`);

const combos = comboData.metaobjects.nodes.map((node) => {
  const get = (key) => node.fields.find((f) => f.key === key)?.value || "";
  return {
    id: node.id,
    handle: node.handle,
    name: get("name"),
    color_1: get("color_1"),
    color_2: get("color_2"),
    color_3: get("color_3"),
    color_4: get("color_4"),
    color_5: get("color_5"),
  };
});

console.log(`Found ${combos.length} combinations.\n`);

// ─── Step 3: Map each combo color to closest paint_color ────────────

function findClosest(hex) {
  if (!hex) return null;
  let best = null;
  let bestDist = Infinity;
  for (const pc of paintColors) {
    if (!pc.hex) continue;
    const dist = colorDistance(hex, pc.hex);
    if (dist < bestDist) {
      bestDist = dist;
      best = pc;
    }
  }
  return { ...best, distance: Math.round(bestDist) };
}

console.log("=== COLOR MAPPING ===\n");

for (const combo of combos) {
  console.log(`${combo.name} (${combo.handle})`);
  const hexes = [combo.color_1, combo.color_2, combo.color_3, combo.color_4, combo.color_5];

  const mappings = [];
  for (let i = 0; i < 5; i++) {
    const hex = hexes[i];
    if (!hex) continue;
    const match = findClosest(hex);
    mappings.push({ slot: i + 1, hex, match });
    const exact = match.distance === 0 ? " (exact)" : "";
    console.log(`  color_${i + 1}: ${hex} → ${match.name} (${match.dlm_code}, ${match.hex}, dist: ${match.distance}${exact})`);
  }
  combo._mappings = mappings;
  console.log();
}

if (DRY_RUN) {
  console.log("DRY RUN — no changes made. Run without --dry-run to apply.");
  process.exit(0);
}

// ─── Step 4: Apply references ───────────────────────────────────────

console.log("=== APPLYING REFERENCES ===\n");

let updated = 0;

for (const combo of combos) {
  const fields = [];
  for (const mapping of combo._mappings) {
    fields.push({
      key: `paint_color_${mapping.slot}`,
      value: mapping.match.id,
    });
  }

  if (fields.length === 0) continue;

  const result = await shopifyGraphQL(`
    mutation UpdateCombo($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { handle }
        userErrors { field message }
      }
    }
  `, {
    id: combo.id,
    metaobject: { fields },
  });

  const errors = result.metaobjectUpdate.userErrors;
  if (errors.length > 0) {
    console.log(`  ✗ ${combo.name} — ${errors[0].message}`);
  } else {
    console.log(`  ✓ ${combo.name} — ${fields.length} colors assigned`);
    updated++;
  }

  await sleep(300);
}

console.log(`\nDone! Updated: ${updated}/${combos.length} combinations.`);
