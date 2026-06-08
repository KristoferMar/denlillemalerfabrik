# How to add a new paint colour (the right way)

This guide documents the full, working procedure for adding a brand-new colour to
the DLM palette — both **creating it in Shopify** (metaobject + variants on every
paint product) and **making it show up and be purchasable in the main colour
component** on the front page.

The worked example throughout is the real one this guide was written from:

> **Add _Råhvid_** — a warm raw-white — as the 217th palette colour, available
> across all paint types, and selectable in the front-page "Vores farver"
> configurator.
>
> - DLM code: **DLM0126** (next free in the Whites family)
> - NCS: **S 0500-N** (Flügger's official Råhvid)
> - Hex: **#F1F0EB**
> - Family: **Whites**

> For adding a new **size** to an existing colour (e.g. the 12 L Råhvid-loft edge
> case), see `add-paint-size-variation.md`. The two guides share the same
> infrastructure (variant map, made-to-order inventory, deploy), so read both.

---

## 0. The data model — sources of truth and mirrors

A colour exists in several places. One is the **source of truth**; the rest are
mirrors that must be kept in sync:

| Location | Role |
|---|---|
| `docs/colors/dlm-colors-with-ncs.json` | **Source of truth.** 6-field records: `handle, dlm_id, ncs_code, name_da, display_hex, family`. |
| `docs/colors/colors.md` | Human-readable table. **Always update this too** (see step 1). |
| Shopify `paint_color` metaobjects | One per colour; carries name/dlm_code/hex/family/ncs. Variants reference it. |
| Shopify `shop.custom.paint_palette` | List metafield of all colour metaobject GIDs (drives palette-wide reads). |
| Shopify product variants | The actual `Farve` option value on each paint product. |
| `snippets/paint-colors-data.liquid` | Per-family arrays the front-page grid renders from (mirror of the JSON). |
| `assets/configurator-variant-map.json` | Static price/availability lookup for the front-page configurator. |

The repo ships scripts that propagate the JSON to most of these — prefer them over
hand-edits where they exist:

- `scripts/sync-colors-to-shopify.mjs` — JSON → `paint_color` metaobjects **and**
  rebuilds the `shop.custom.paint_palette` metafield. Idempotent.
- `scripts/products/add-missing-color-variants.js` — adds any missing colour
  variants to the **five configurator products**, deriving price-per-size from
  existing variants.
- `scripts/products/build-configurator-variant-map.js` — rebuilds
  `configurator-variant-map.json` from the Admin API.

The manual Admin-API equivalents are shown below too, since that's how the Råhvid
pass was actually executed (and it's handy when adding to the full catalogue, not
just the configurator subset).

---

## 1. Decide the colour values — and write them to `colors.md`

Before touching Shopify, lock the four attributes every colour must have:

- **Friendly name** (Danish), e.g. `Råhvid`.
- **NCS code** — **must match what Flügger uses** for that colour. Look it up on
  flugger.dk (Råhvid → `S 0500-N`). Do not invent one.
- **Hex** — the colour's display swatch, e.g. `#F1F0EB` (Flügger's digital value).
- **DLM code / handle** — the next free code **in that colour's family**. Families
  are `01 Whites, 02 Blues, 03 Greys, 04 Greens, 05 Warm Neutrals, 06 Yellows,
  07 Pinks, 08 Reds, 09 Purples, 10 Oranges, 11 Blacks`. Whites ran DLM0101–DLM0125,
  so Råhvid became **DLM0126** with handle `dlm0126`.

**Always add the colour to `docs/colors/colors.md`** under its family table, in the
exact pipe-table format:

```markdown
| dlm0126  | DLM0126  | Råhvid            | S 0500-N      | #F1F0EB     |
```

Update the count line at the top of `colors.md` (e.g. "200 colors" → "201 colors",
noting the family it was added to). It's fine for an NCS code to repeat across
colours (Råhvid's `S 0500-N` is also Porcelæn's) — same base tone, different hex.

Then add the same record to the **source of truth**,
`docs/colors/dlm-colors-with-ncs.json`, placed so the family stays contiguous
(Råhvid goes right after DLM0125 Magnolia):

```json
{ "handle": "dlm0126", "dlm_id": "DLM0126", "ncs_code": "S 0500-N",
  "name_da": "Råhvid", "display_hex": "#F1F0EB", "family": "Whites" }
```

Validate the JSON after editing (`python3 -c "import json; json.load(open('docs/colors/dlm-colors-with-ncs.json'))"`).

---

## 2. Shopify: create the metaobject + extend the palette

The colour needs a `paint_color` metaobject; product variants link to it, and the
shop-level `paint_palette` list must include it.

**Preferred:** run the sync script — it reads the JSON, creates/updates metaobjects,
and rebuilds the palette metafield:

```bash
node scripts/sync-colors-to-shopify.mjs
```

**Manual equivalent** (what we ran via the Admin API):

```graphql
mutation {
  metaobjectCreate(metaobject: {
    type: "paint_color", handle: "dlm0126",
    fields: [
      { key: "name",         value: "Råhvid" },
      { key: "dlm_code",     value: "DLM0126" },
      { key: "hex_color",    value: "#F1F0EB" },
      { key: "color_family", value: "Whites" },
      { key: "ncs_code",     value: "S 0500-N" }
    ]
  }) { metaobject { id handle } userErrors { field message } }
}
```

Then append the new metaobject GID to `shop.custom.paint_palette`
(`list.metaobject_reference`) via `metafieldsSet` — read the current list, add the
new GID at the end, write the whole array back (216 → 217 references).

---

## 3. Shopify: add the colour as a variant on every paint product

A new palette colour should exist on **all colour-based paint products** — the 16
products that carry a `Farve` option. (Exclude the 6 **Specialblanding** products:
they have no `Farve` option — they're mixed to any NCS and sold by size only.)

For each product, add one variant per existing size, following the conventions:

- **Option values**: `Farve` = colour name (`Råhvid`), `Størrelse` = each size token.
- **SKU**: `DLM<type-prefix>-<colour-code>-G<glans>-<size>`, e.g. `DLM10-0126-G5-1L`.
- **Price**: mirror the product's existing per-size prices exactly (prices are
  colour-agnostic — read them off any existing colour on that product).
- **Metafield**: set `custom.paint_color` (`metaobject_reference`) to the new
  colour's metaobject GID.

**Preferred:** `node scripts/products/add-missing-color-variants.js` (covers the
five configurator products and auto-derives pricing).

**Manual equivalent** — `productVariantsBulkCreate` with `strategy: DEFAULT`, one
call per product (this is how all 16 products got Råhvid):

```graphql
mutation BC($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: DEFAULT) {
    productVariants { id sku title price } userErrors { field message }
  }
}
```

with each variant carrying `optionValues`, `price`, `inventoryItem.sku`, and the
`custom.paint_color` metafield (see the size guide for the exact variable shape).

### 3a. Inventory — make it made-to-order (`tracked = false`)

**Critical gotcha.** Paint is produced to order. New variants created with the
defaults (`tracked = true`, `DENY`, qty 0) show **"udsolgt"** everywhere. Set every
new variant to:

- `inventoryItem.tracked = false`, `inventoryPolicy = CONTINUE` → `availableForSale = true`.

Fix in bulk per product with `productVariantsBulkUpdate`
(`variants: [{ id, inventoryItem: { tracked: false } }]`). Verify
`availableForSale: true` on the new variants.

---

## 4. Make it appear in the main colour component (the grid)

The front-page "Vores farver" grid does **not** read Shopify. It renders from
hard-coded per-family arrays in `snippets/paint-colors-data.liquid` (a mirror of the
JSON; this exists because Liquid caps `for x in metafield.value` at 50 iterations).

Add the colour to its family array — for Råhvid, append to `whites_arr`. Each entry
is `<dlm_id>|<name_da>|<display_hex>`:

```liquid
{%- assign whites_arr = '...~~DLM0125|Magnolia|#DECA91~~DLM0126|Råhvid|#F1F0EB' | split: '~~' -%}
```

Then update the visible count in `sections/kmeconsulting-product-finder.liquid`:

```liquid
<span class="vores-farver__eyebrow">VORES FARVER · 217 NUANCER</span>
```

How the grid copes automatically (no other edits needed):
- The grid is `11 families × max_rows`, where `max_rows` is the largest family
  size. Adding a 26th white makes `max_rows = 26`; the other families render empty
  placeholder cells in that extra row.
- The JS shuffle (`assets/kmeconsulting-product-finder.js`) scatters all real
  swatches and sets `display:none` on the empties, so the 217 real swatches flow
  contiguously. The JS uses the live `swatches.length`, so there's no hard-coded
  "216" to break.

> If `paint-colors-data.liquid` is regenerated by a script from the JSON, prefer
> that. Otherwise hand-edit the family array as above — keep it byte-consistent
> with `dlm-colors-with-ncs.json`.

---

## 5. Make it selectable in the configurator (variant map)

Adding the colour to the grid lets the customer *click* it, but the configurator
that opens resolves price + availability from the static
`assets/configurator-variant-map.json`. If the colour isn't in that map it shows
**"udsolgt"** even though it exists in Shopify.

The map only covers the **five configurator products** (`vaegmaling-glans-5`,
`vaegmaling-glans-10`, `loftmaling-glans-5`, `trae-metal-glans-40`,
`traebeskyttelse-glans-20`). Add the new colour's entries (keyed at runtime by
`handle||color||size`):

```json
{ "handle": "loftmaling-glans-5", "color": "Råhvid", "size": "10L",
  "variant_id": 56697439486338, "available": true, "price": "469,00 kr." }
```

**Preferred:** `node scripts/products/build-configurator-variant-map.js` (rebuilds
the whole file from the Admin API — pick this up automatically once the variants
from step 3 exist). If hand-editing, append before the trailing `]}` and re-validate.

> The map is fetched at runtime. Make sure the fetch uses a version-stamped URL
> (`window.__cfgVariantMapUrl`, injected from the section via `asset_url`) so a
> freshly pushed map isn't masked by CDN cache. See `add-paint-size-variation.md`
> step 6.

---

## 6. Generate the room preview images (recolor + upload + wire)

Every colour needs photoreal **room preview images** — the scenes the configurator
shows so the customer can see the colour on a real wall. We don't AI-generate per
colour; we recolour a few base room photos through their wall masks, which is
colour-exact and runs in seconds.

Inputs (already in the repo — reuse them, don't re-shoot):

- `images/base-rooms/{room}.png` — the 5 base photos: `badevaerelse`, `entre`,
  `koekken`, `sovevaerelse`, `stue`.
- `images/wall-masks/{room}-full.png` — the matching **wall masks** (white = paint
  this pixel, black = leave alone, grey = soft blend at edges).

The engine is `scripts/room-recolor/recolor.py` — a LAB / multiply-blend recolour
that preserves the original lighting (shadows get a darker paint, highlights a
lighter one). `batch.py` loops it across the whole palette, reading hex values from
`docs/colors/dlm-colors-with-ncs.json`, so the colour you added in step 1 is picked
up automatically.

```bash
# 1) Generate the recoloured rooms. Re-runs only regenerate stale outputs.
#    Single colour, one room at a time (CLI: recolor.py BASE MASK HEX OUTPUT):
python scripts/room-recolor/recolor.py \
  images/base-rooms/stue.png images/wall-masks/stue-full.png \
  "#F1F0EB" images/rooms-recolored/stue/DLM0126.jpg
#    …or just run the whole batch (all rooms × full palette):
python scripts/room-recolor/batch.py

# 2) Upload to Shopify Files (idempotent; --color limits to one colour).
node scripts/files/upload-recolored-rooms.js --color DLM0126

# 3) Wire the uploaded URLs into the configurator's hover/preview. This rewrites
#    the <script id="vf-color-photos"> JSON block in the section from
#    images/rooms-recolored/manifest.json.
node scripts/files/wire-vf-color-photos.js
```

Notes:

- Use the **existing wall masks** so every colour is shown in the same scenes —
  that's the whole point (apples-to-apples comparison). The kitchen in use is the
  smooth-wall **koekken2** variant (its mask is built by `make_koekken2_mask.py`).
- Filenames are namespaced `dlm-room-<room>-DLM####.jpg` so 200+ colours don't
  collide in Shopify Files; the upload step polls until `UPLOADED` to capture the
  final CDN URL, and writes/updates `images/rooms-recolored/manifest.json`.
- `wire-vf-color-photos.js` only edits the `vf-color-photos` block — everything else
  in the section is preserved.

This changes the section file, so it ships in the next step.

---

## 7. Deploy

There is **no git-based / automated deployment**. Push the working files to the
theme with the Shopify CLI:

```bash
cd ~/development/kunder/denlillemalerfabrik
shopify theme push
```

Steps 2–3 (Shopify metaobject/variants/inventory) and the Shopify Files uploads in
step 6 are already live and need no push. Only the theme files do:
`snippets/paint-colors-data.liquid`, `sections/kmeconsulting-product-finder.liquid`
(both the palette arrays/count **and** the `vf-color-photos` block from step 6),
`assets/configurator-variant-map.json`, and (source/docs)
`docs/colors/dlm-colors-with-ncs.json`, `docs/colors/colors.md`.

Then **hard refresh** (Cmd+Shift+R) / test in incognito.

---

## 8. Verification checklist

Docs / source of truth:
- [ ] Row added to `docs/colors/colors.md` with name, **NCS (Flügger)**, hex, DLM code.
- [ ] Record added to `docs/colors/dlm-colors-with-ncs.json`; JSON still valid.
- [ ] Count line in `colors.md` and the eyebrow in the section bumped.

Shopify:
- [ ] `paint_color` metaobject exists (handle, name, dlm_code, hex_color,
      color_family, ncs_code).
- [ ] GID appended to `shop.custom.paint_palette` (count +1).
- [ ] Colour variant exists on every colour-based paint product, with correct SKU,
      mirrored price, and `custom.paint_color` link.
- [ ] All new variants `availableForSale: true` (`tracked = false`).

Theme / front end:
- [ ] Colour appears in `paint-colors-data.liquid`'s family array.
- [ ] `configurator-variant-map.json` has the colour for the 5 configurator products.
- [ ] Room previews generated (`images/rooms-recolored/.../DLM####.jpg`), uploaded to
      Shopify Files, and wired into the `vf-color-photos` block (step 6).
- [ ] Pushed + hard refresh.

In the browser:
- [ ] The new swatch appears in the "Vores farver" grid (and in search/filter).
- [ ] Clicking it opens the configurator with the right price and
      "klar til afhentning" (not "udsolgt").
- [ ] The room preview image shows the wall in the new colour.
- [ ] It can be added to cart.

---

## Appendix — the pipeline in one line each

1. Choose values (name, **Flügger NCS**, hex, next-free DLM code).
2. `colors.md` + `dlm-colors-with-ncs.json`  ← always both.
3. `sync-colors-to-shopify.mjs`  → metaobject + `paint_palette`.
4. `add-missing-color-variants.js` (or manual bulk create) → variants on products.
5. Set `tracked = false` on the new variants (made-to-order).
6. `paint-colors-data.liquid` family array + section count → grid.
7. `build-configurator-variant-map.js` → configurator price/availability.
8. Room images: `room-recolor/batch.py` (uses base-rooms + **wall-masks**) →
   `upload-recolored-rooms.js --color DLM####` → `wire-vf-color-photos.js`.
9. `shopify theme push` + hard refresh.
