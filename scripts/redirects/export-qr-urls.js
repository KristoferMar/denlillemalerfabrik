#!/usr/bin/env node
/**
 * Exports a handoff list of every /qr/* URL with its human-readable label,
 * ready for a third-party QR printer.
 *
 * Outputs:
 *   - qr-urls.csv   (flat, for spreadsheets / QR bulk tools)
 *   - qr-urls.md    (readable review in markdown)
 *
 * URLs use the production domain, NOT the myshopify subdomain — since
 * redirects are store-wide, the same path works on either host.
 *
 * Usage:
 *   node scripts/redirects/export-qr-urls.js
 *   node scripts/redirects/export-qr-urls.js --base https://www.other.dk
 *   node scripts/redirects/export-qr-urls.js --out some/where.csv  (extension → format)
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL, shopifyRest, getScriptArgs, sleep } from "../shopify-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

// ─── CLI ────────────────────────────────────────────────────────────
const args = getScriptArgs();

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = flag("--base", "https://www.denlillemalerfabrik.dk").replace(/\/+$/, "");
const CSV_OUT = resolve(PROJECT_ROOT, flag("--out-csv", "qr-urls.csv"));
const MD_OUT = resolve(PROJECT_ROOT, flag("--out-md", "qr-urls.md"));

// ─── Pretty labels for paint types ──────────────────────────────────
const PAINT_TYPE_LABELS = {
  vaegmaling: "Vægmaling",
  loftmaling: "Loftmaling",
  "trae-og-metal": "Træ & Metal",
  strukturmaling: "Strukturmaling",
  traebeskyttelse: "Træbeskyttelse",
  gulvmaling: "Gulvmaling",
};

// ─── Fetch helpers ─────────────────────────────────────────────────
// Includes variant-level paint_color metafield → dlm_code, used for
// building the QR slug for the new (paint-type, glans) product model.
const PRODUCT_FIELDS = `
  id title handle tags
  options { name values }
  variants(first: 250) {
    nodes {
      id sku
      selectedOptions { name value }
      metafield(namespace: "custom", key: "paint_color") {
        reference {
          ... on Metaobject {
            dlm_code: field(key: "dlm_code") { value }
            name_field: field(key: "name") { value }
          }
        }
      }
    }
  }
`;

async function fetchByTag(tagQuery) {
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

function colorNameFromTitle(title) {
  // "Vægmaling — Murstensrød"  →  "Murstensrød"
  const parts = title.split(/\s*—\s*/);
  return parts.length > 1 ? parts.slice(1).join(" — ") : title;
}

// ─── Fetch live /qr/* redirects so the export matches reality ──────
async function fetchLiveSlugs() {
  const all = [];
  let sinceId = 0;
  while (true) {
    const res = await shopifyRest(`redirects.json?limit=250&since_id=${sinceId}`);
    const batch = res.redirects ?? [];
    all.push(...batch);
    if (batch.length < 250) break;
    sinceId = batch[batch.length - 1].id;
  }
  return new Set(all.filter((r) => r.path.startsWith("/qr/")).map((r) => r.path));
}

const liveSlugs = await fetchLiveSlugs();

// ─── Build rows ─────────────────────────────────────────────────────
const paintProducts = await fetchByTag("tag:paint");
const sortimentProducts = await fetchByTag("tag:sortiment");

const rows = [];

// (a) Paint products in the new (paint-type, glans)-per-product model.
//     Each product has Farve × Størrelse variants.  One QR row per color
//     at the default 10L size.
for (const p of paintProducts) {
  const tags = parseTags(p.tags);
  const prefix = tags["paint-type-prefix"];
  const glans = tags["glans"];
  const paintType = tags["paint-type"];
  if (!prefix || !glans || !paintType) continue;

  const paintLabel = PAINT_TYPE_LABELS[paintType] ?? paintType;

  for (const v of p.variants.nodes) {
    const opts = Object.fromEntries(v.selectedOptions.map((s) => [s.name, s.value]));
    if (opts["Størrelse"] !== "10L") continue;

    const colorName = opts["Farve"] ?? "";
    const dlmCode = v.metafield?.reference?.dlm_code?.value;
    if (!dlmCode) continue;
    const colorDigits = dlmCode.replace(/^DLM/, ""); // "0101"
    const fullCode = `DLM${prefix}-${colorDigits}`;

    const slug = `/qr/${fullCode.toLowerCase()}-g${glans}`;
    if (!liveSlugs.has(slug)) continue;

    // Try to infer the color family from the metaobject name or leave blank
    // (the old model carried color-family tags on the product; the new model
    // doesn't — we rely on the paint_color metaobject reference instead).
    rows.push({
      kind: "color",
      url: `${BASE}${slug}`,
      label: `${paintLabel} — ${colorName} · Glans ${glans}`,
      paintType: paintLabel,
      color: colorName,
      colorFamily: "",
      glans,
      fullCode,
      sku: v.sku,
      handle: p.handle,
      slug,
    });
  }
}

// (b) Sortiment products (no color/glans) → one row per product
const seenHandles = new Set(rows.map((r) => r.handle));
for (const p of sortimentProducts) {
  if (seenHandles.has(p.handle)) continue; // already handled by color flow
  const tags = parseTags(p.tags);
  if (tags["paint-type"] || tags["full-code"]) continue; // safety

  // Prefer a 10L variant for the handoff SKU (matches redirect target)
  const v = p.variants.nodes.find((n) =>
    n.selectedOptions.some((o) => o.name === "Størrelse" && /^10\s*L$/i.test(o.value))
  ) ?? p.variants.nodes[0];

  const categorySlug = tags["kategori"] ?? "sortiment";
  const slug = `/qr/${p.handle}`;
  if (!liveSlugs.has(slug)) continue;

  rows.push({
    kind: "sortiment",
    url: `${BASE}${slug}`,
    label: p.title,
    paintType: categorySlug,
    color: "",
    colorFamily: "",
    glans: "",
    fullCode: "",
    sku: v?.sku ?? "",
    handle: p.handle,
    slug,
  });
}

// Sort: kind (colors first, sortiment second), then paint type, then code, then glans
rows.sort(
  (a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.paintType.localeCompare(b.paintType) ||
    (a.fullCode || a.handle).localeCompare(b.fullCode || b.handle) ||
    (Number(a.glans) || 0) - (Number(b.glans) || 0)
);

// ─── CSV ────────────────────────────────────────────────────────────
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const csvHeader = [
  "url",
  "label",
  "kind",
  "paint_type",
  "color",
  "color_family",
  "glans",
  "full_code",
  "sku",
  "product_handle",
  "slug",
].join(",");

const csvBody = rows
  .map((r) =>
    [
      r.url,
      r.label,
      r.kind,
      r.paintType,
      r.color,
      r.colorFamily,
      r.glans,
      r.fullCode,
      r.sku,
      r.handle,
      r.slug,
    ]
      .map(csvEscape)
      .join(",")
  )
  .join("\n");

writeFileSync(CSV_OUT, csvHeader + "\n" + csvBody + "\n", "utf-8");

// ─── Markdown ───────────────────────────────────────────────────────
const now = new Date().toISOString();
const colorRows = rows.filter((r) => r.kind === "color");
const sortimentRows = rows.filter((r) => r.kind === "sortiment");

const md = [];
md.push(`# QR Code URL Handoff`);
md.push("");
md.push(`- **Base URL:** ${BASE}`);
md.push(`- **Generated:** ${now}`);
md.push(`- **Total QR codes:** ${rows.length}  (${colorRows.length} colored + ${sortimentRows.length} sortiment)`);
md.push("");
md.push(`All URLs below are Shopify redirects (editable in admin). Scanning lands on the right product page with the 10 L variant (and glans, if applicable) pre-selected.`);
md.push("");

// Colored paints grouped by paint type
const byPaint = new Map();
for (const r of colorRows) {
  if (!byPaint.has(r.paintType)) byPaint.set(r.paintType, []);
  byPaint.get(r.paintType).push(r);
}

md.push(`# Colored paints`);
md.push("");
for (const [paint, group] of byPaint) {
  md.push(`## ${paint} — ${group.length} QR codes`);
  md.push("");
  md.push(`| # | Color | Glans | SKU (10 L) | URL | Label |`);
  md.push(`|---|---|---|---|---|---|`);
  group.forEach((r, i) => {
    md.push(
      `| ${i + 1} | ${r.color} | ${r.glans} | \`${r.sku ?? ""}\` | [${r.url}](${r.url}) | ${r.label} |`
    );
  });
  md.push("");
}

// Sortiment grouped by category
if (sortimentRows.length) {
  const byCat = new Map();
  for (const r of sortimentRows) {
    if (!byCat.has(r.paintType)) byCat.set(r.paintType, []);
    byCat.get(r.paintType).push(r);
  }

  md.push(`# Sortiment (no color/glans)`);
  md.push("");
  for (const [cat, group] of byCat) {
    md.push(`## ${cat} — ${group.length} QR codes`);
    md.push("");
    md.push(`| # | Product | SKU | URL |`);
    md.push(`|---|---|---|---|`);
    group.forEach((r, i) => {
      md.push(
        `| ${i + 1} | ${r.label} | \`${r.sku ?? ""}\` | [${r.url}](${r.url}) |`
      );
    });
    md.push("");
  }
}

writeFileSync(MD_OUT, md.join("\n"), "utf-8");

console.log(`Generated ${rows.length} QR URLs.`);
console.log(`  CSV: ${CSV_OUT}`);
console.log(`  MD:  ${MD_OUT}`);
