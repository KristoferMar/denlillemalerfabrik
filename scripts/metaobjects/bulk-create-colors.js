#!/usr/bin/env node
/**
 * Bulk-create paint_color metaobjects in Shopify.
 *
 * Usage:
 *   1. Fill in the COLORS array below with your color data.
 *   2. Make sure .env has your store + token.
 *   3. Run:  node bulk-create-colors.js
 *            node bulk-create-colors.js --dry-run   (preview only)
 */

import { shopifyGraphQL, sleep, getScriptArgs } from "../shopify-client.js";

// ─── YOUR COLOR DATA ────────────────────────────────────────────────
// Edit this array with all the colors you want to create.
// Fields match your existing paint_color metaobject definition:
//   - name:         Display name (required)
//   - hex_color:    Hex code including # (required)
//   - color_family: Grouping name, e.g. "Hvid", "Grå", "Blå" (optional)
//   - handle:       URL-friendly handle (auto-generated from name if omitted)

const COLORS = [
  // ── Hvide / White tones ──
  { name: "Snehvid", hex_color: "#FFFFFF", color_family: "Hvid" },
  { name: "Råhvid", hex_color: "#FAF0E6", color_family: "Hvid" },
  { name: "Knækket Hvid", hex_color: "#F5F0EB", color_family: "Hvid" },
  { name: "Perlemor", hex_color: "#F0EDE8", color_family: "Hvid" },

  // ── Grå / Grey tones ──
  { name: "Lysegrå", hex_color: "#D3D3D3", color_family: "Grå" },
  { name: "Varmgrå", hex_color: "#B8B0A8", color_family: "Grå" },
  { name: "Betong", hex_color: "#8E8E8E", color_family: "Grå" },
  { name: "Kulgra", hex_color: "#4A4A4A", color_family: "Grå" },

  // ── Blå / Blue tones ──
  { name: "Himmelblå", hex_color: "#87CEEB", color_family: "Blå" },
  { name: "Havblå", hex_color: "#4A90D9", color_family: "Blå" },
  { name: "Midnatsblå", hex_color: "#191970", color_family: "Blå" },

  // ── Grøn / Green tones ──
  { name: "Salvie", hex_color: "#9CAF88", color_family: "Grøn" },
  { name: "Skovgrøn", hex_color: "#2E8B57", color_family: "Grøn" },
  { name: "Oliven", hex_color: "#6B8E23", color_family: "Grøn" },

  // ── Gul / Yellow tones ──
  { name: "Solskin", hex_color: "#FFD700", color_family: "Gul" },
  { name: "Sennep", hex_color: "#D4A017", color_family: "Gul" },

  // ── Rød / Red tones ──
  { name: "Terracotta", hex_color: "#CC6644", color_family: "Rød" },
  { name: "Valmue", hex_color: "#E25822", color_family: "Rød" },

  // ── Sort / Black ──
  { name: "Dybsort", hex_color: "#1A1A1A", color_family: "Sort" },

  // Add more colors here...
  // { name: "...", hex_color: "#......", color_family: "..." },
];

// ─── METAOBJECT TYPE ────────────────────────────────────────────────
const METAOBJECT_TYPE = "paint_color";

// ─── GRAPHQL ────────────────────────────────────────────────────────

const CREATE_MUTATION = `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
        handle
        displayName
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── MAIN ───────────────────────────────────────────────────────────

const dryRun = getScriptArgs().includes("--dry-run");

async function main() {
  console.log(`\n🎨 Bulk-creating ${COLORS.length} colors (type: ${METAOBJECT_TYPE})`);
  if (dryRun) console.log("   (DRY RUN — nothing will be created)\n");
  else console.log();

  let created = 0;
  let errors = 0;

  for (const color of COLORS) {
    const handle = color.handle || color.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/-+$/, "");

    const fields = [
      { key: "name", value: color.name },
      { key: "hex_color", value: color.hex_color },
    ];

    if (color.color_family) {
      fields.push({ key: "color_family", value: color.color_family });
    }

    if (dryRun) {
      console.log(`  [DRY] ${color.name} (${color.hex_color}) → handle: ${handle}`);
      created++;
      continue;
    }

    try {
      const data = await shopifyGraphQL(CREATE_MUTATION, {
        metaobject: {
          type: METAOBJECT_TYPE,
          handle,
          fields,
        },
      });

      const result = data.metaobjectCreate;

      if (result.userErrors.length > 0) {
        console.error(`  ✗ ${color.name}: ${result.userErrors.map((e) => e.message).join(", ")}`);
        errors++;
      } else {
        console.log(`  ✓ ${color.name} (${color.hex_color}) → ${result.metaobject.handle}`);
        created++;
      }
    } catch (err) {
      console.error(`  ✗ ${color.name}: ${err.message}`);
      errors++;
    }

    // Respect rate limits — ~2 requests/sec is safe
    await sleep(500);
  }

  console.log(`\nDone! Created: ${created}, Errors: ${errors}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
