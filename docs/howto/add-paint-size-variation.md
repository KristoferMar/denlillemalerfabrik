# How to add a paint size variation (the right way)

This guide documents the full, working procedure for adding a **size** to a paint
product — including the tricky case of a **sparse / conditional size** that should
only appear for one specific colour + product combination.

The worked example throughout is the real one this guide was written from:

> **Add a 12 L bucket that only shows up when the customer picks the colour
> _Råhvid_ on _Loftmaling Glans 5_ (and Glans 1).** Every other colour and every
> other product must keep its normal 1 / 3 / 5 / 10 L sizes only.

If you just want to add a normal size that exists for *every* colour on a product,
you still follow the same steps — just skip the "conditional" parts in step 5.

---

## 0. Mental model — where sizes actually come from

There are **three** independent places a size lives. Miss one and it looks broken
in a way that's hard to debug, so internalise this first:

1. **Shopify variants** — the real `Størrelse` option value on the product, e.g.
   `Råhvid / 12L`. This is the source of truth for price + purchasability.
2. **`assets/configurator-variant-map.json`** — a static, pre-built lookup the
   front-page configurator reads at runtime for price + availability. It is **not**
   live Shopify data; it's a snapshot that must be updated when variants change.
3. **`assets/kmeconsulting-product-finder.js` → `CFG_SIZES`** — a hard-coded list
   that decides which size *chips* can render at all in the configurator.

The front-page "Vores farver" component (`sections/kmeconsulting-product-finder.liquid`
+ its JS) is the **live** configurator the customer uses. There is also a
standalone `kmeconsulting-paint-pdp-configurator.*` in the repo — it is **not**
mounted on product pages today, so don't waste time editing it. Product pages
themselves use Shopify's native variant picker (`snippets/variant-main-picker.liquid`),
which derives sizes directly from the product's variants and needs no map.

---

## 1. Create the variant in Shopify

Use the Admin GraphQL `productVariantsBulkCreate` with `strategy: DEFAULT` (this
appends to the existing option matrix; it does **not** wipe other variants).

Conventions to follow so the catalogue stays consistent:

- **Option values**: `Farve` = the colour name (e.g. `Råhvid`), `Størrelse` = the
  bare size token (`12L`, no space — the space is only in the *label*).
- **SKU**: `DLM<type-prefix>-<colour-code>-G<glans>-<size>`, e.g. `DLM20-0126-G5-12L`
  (20 = loftmaling, 0126 = Råhvid's DLM code, G5 = glans 5, 12L = size).
- **Price**: mirror the product's existing per-size pricing curve. Loft ladder is
  1L=89, 3L=179, 5L=279, 10L=469; a 12 L lands at **549** (~46 kr/L, following the
  "bigger = cheaper per litre" trend).
- **Metafield link**: set `custom.paint_color` (`metaobject_reference`) to the
  colour's `paint_color` metaobject GID, exactly like every other variant.

```graphql
mutation BC($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: DEFAULT) {
    productVariants { id sku title price }
    userErrors { field message code }
  }
}
```

```json
// variables (one variant shown)
{
  "productId": "gid://shopify/Product/15319549149570",   // Loftmaling Glans 5
  "variants": [{
    "optionValues": [
      { "optionName": "Farve", "name": "Råhvid" },
      { "optionName": "Størrelse", "name": "12L" }
    ],
    "price": "549.00",
    "inventoryItem": { "sku": "DLM20-0126-G5-12L", "tracked": false },
    "metafields": [{
      "namespace": "custom", "key": "paint_color",
      "type": "metaobject_reference",
      "value": "gid://shopify/Metaobject/479172166018"
    }]
  }]
}
```

A sparse size only needs to exist on the products it applies to — for the 12 L
case that's **Loftmaling Glans 5** and **Loftmaling Glans 1**, nothing else.

---

## 2. Inventory: paint is made-to-order → `tracked = false`

**This is the #1 gotcha.** All paint at DLM is produced to order and must read as
available regardless of stock. The convention is:

- `inventoryItem.tracked = false`
- `inventoryPolicy = CONTINUE`
- → `availableForSale = true`

If you create a variant with the defaults (`tracked = true`, `DENY`, qty 0) it will
show **"udsolgt"** everywhere and the configurator will refuse to add it to cart.

Set it explicitly (you can do it in the create call above, or fix afterwards in
bulk per product):

```graphql
mutation BU($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { sku availableForSale inventoryItem { tracked } }
    userErrors { field message }
  }
}
# variants: [{ id, inventoryItem: { tracked: false } }, ...]
```

Verify `availableForSale: true` on every new variant before moving on.

---

## 3. Update `assets/configurator-variant-map.json`

The front-page configurator does **not** read live Shopify data. It reads this
static asset. Two upstream caps make a live read impossible (Liquid truncates
`product.variants` at 250; the `/products/{handle}.js` endpoint has the same
ceiling), so a pre-built map is shipped instead.

The map only covers the **five products exposed in the configurator** (see
`cfg_handles` in the section liquid and `CFG_SURFACES` in the JS):
`vaegmaling-glans-5`, `vaegmaling-glans-10`, `loftmaling-glans-5`,
`trae-metal-glans-40`, `traebeskyttelse-glans-20`.

Shape — a flat array under `variants`, keyed at runtime by `handle||color||size`:

```json
{ "handle": "loftmaling-glans-5", "color": "Råhvid", "size": "12L",
  "variant_id": 56697447219586, "available": true, "price": "549,00 kr." }
```

Notes:
- `color` must match the colour's **name** exactly (`Råhvid`), and `size` the bare
  token (`12L`) — these are the lookup key.
- `price` uses Danish formatting `"549,00 kr."`.
- `available: true` (because the variant is made-to-order — see step 2).

Preferred: regenerate the whole map with
`scripts/products/build-configurator-variant-map.js` (it reads the Admin API and
rebuilds every entry). If you hand-edit instead, append the new entries before the
closing `]}` and re-validate the JSON (`python3 -c "import json,sys; json.load(open(...))"`).

If a colour is missing from this map entirely it renders as **"udsolgt"** in the
configurator even though it exists in Shopify — that's the symptom of a stale map.

---

## 4. Add the size to `CFG_SIZES` (mark sparse sizes `conditional`)

In `assets/kmeconsulting-product-finder.js`:

```js
var CFG_SIZES = [
  { option: '1L',  label: '1 L',  coverage: '~8 m²' },
  { option: '3L',  label: '3 L',  coverage: '~24 m²' },
  { option: '5L',  label: '5 L',  coverage: '~40 m²' },
  { option: '10L', label: '10 L', coverage: '~80 m²', popular: true },
  { option: '12L', label: '12 L', coverage: '~96 m²', conditional: true }  // sparse
];
```

- `option` must match the Shopify `Størrelse` value exactly (it's the 3rd part of
  the `handle||color||size` key).
- Coverage convention is ~8 m² per litre.
- Add `conditional: true` for a sparse size so it is **only** shown where a
  matching variant exists (next step). A normal universal size omits this flag and
  always renders.

---

## 5. Make the size step availability-aware (the real fix)

A sparse size must appear **only** for product+colour combos that actually have it.
Two pieces make this work — both are required:

**(a) Filter the rendered chips by what the map offers** for the current finish
handle + colour:

```js
function sizeOffered(option) {
  var entry = CFG_SURFACES[state.surface];
  var fin = entry && entry.finishes.find(function (f) { return f.glans === state.finish; });
  var handle = fin && fin.handle;
  if (!handle) return false;
  return variantsByKey.has(handle + '||' + c.name + '||' + option);
}

function visibleSizes() {
  return CFG_SIZES.filter(function (s) {
    return !s.conditional || sizeOffered(s.option);
  });
}
```

`sizeStep()` and `syncSize()` render `visibleSizes()` (not the raw `CFG_SIZES`).
`syncSize()` rebuilds the size grid's `innerHTML` and, if the currently selected
size is no longer offered, falls back to the default.

**(b) Re-render the size step when surface or finish changes.** This was the bug
that made everything *look* broken even when steps 1–4 were correct: `applySelection`
only called `syncSize()` on a direct size click — not when the customer switched
surface/finish. So landing on Loft never rebuilt the size grid, and 12 L never
appeared. Fix — call `syncSize()` in **all three** branches:

```js
function applySelection(group, value) {
  if (group === 'surface') {
    ...
    syncSize();        // ← offered sizes depend on the new finish handle + colour
    ...
  } else if (group === 'finish') {
    ...
    syncSize();        // ← different product handle ⇒ re-evaluate sizes
    ...
  } else if (group === 'size') {
    ...
    syncSize();
    ...
  }
}
```

`syncSize()` is also called from `syncAll()`, which runs on first render and again
after the static map finishes loading (via `registerActiveSync`).

---

## 6. Cache-bust the map fetch

The JS fetches the map at runtime. If it requests a plain
`/assets/configurator-variant-map.json` (no version query), Shopify's CDN can serve
a **stale** copy long after you push — so your updated map never reaches the
browser. Inject the versioned URL from Liquid (the `asset_url` filter appends a
`?v=<hash>` that changes whenever the file changes):

In `sections/kmeconsulting-product-finder.liquid`, just before the script tag:

```liquid
<script>window.__cfgVariantMapUrl = {{ 'configurator-variant-map.json' | asset_url | json }};</script>
{{ 'kmeconsulting-product-finder.js' | asset_url | script_tag }}
```

In the JS, prefer that URL:

```js
var variantMapUrl = window.__cfgVariantMapUrl
  || (window.Shopify && window.Shopify.routes && window.Shopify.routes.root
    ? window.Shopify.routes.root + 'assets/configurator-variant-map.json'
    : '/assets/configurator-variant-map.json');
fetch(variantMapUrl) ...
```

---

## 7. Deploy

There is **no git-based / automated deployment**. The live theme is updated by
pushing the working files with the Shopify CLI:

```bash
cd ~/development/kunder/denlillemalerfabrik
shopify theme push        # push to the theme you're testing
```

Then **hard refresh** (Cmd+Shift+R) — test in an incognito window if unsure, to
rule out browser cache. Steps 1–2 (Shopify side) are already live and need no push;
only the asset/section/JS files do.

---

## 8. Verification checklist

Server side (Shopify):
- [ ] New variant exists with the right SKU and price.
- [ ] `availableForSale: true` (i.e. `inventoryItem.tracked = false`).
- [ ] Variant's `custom.paint_color` points at the colour metaobject.
- [ ] The product's `Størrelse` option now lists the new size (Shopify admin).

Map + theme:
- [ ] `configurator-variant-map.json` has `handle||color||size` entries for the new
      size on every relevant product, with `available: true` and a price.
- [ ] `CFG_SIZES` includes the size (with `conditional: true` if sparse).
- [ ] `node --check assets/kmeconsulting-product-finder.js` passes.
- [ ] Pushed to the theme + hard refresh.

In the live configurator:
- [ ] Pick the target colour → surface → finish: the new size appears.
- [ ] Pick a *different* colour or product: the sparse size is **absent**.
- [ ] The CTA shows the right price and "klar til afhentning" (not "udsolgt").

---

## Appendix — why it broke each time (debug log)

The order in which symptoms were chased, so future-you recognises them fast:

1. **Size missing, everything looked right** → `applySelection` wasn't calling
   `syncSize()` on surface/finish change (step 5b). This was the root cause.
2. **Colour showed "udsolgt"** → variant was `tracked = true` / not in the map
   (steps 2 + 3).
3. **"Pushed but still old"** → map fetched without a cache-buster (step 6), and/or
   the theme simply hadn't been pushed yet (step 7).
4. **Edited the wrong file** → `kmeconsulting-paint-pdp-configurator.*` is dormant;
   the live one is `kmeconsulting-product-finder.*` (step 0).
