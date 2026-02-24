# Product Finder Component — Step by Step

A multi-step selector that helps customers find the right paint product by choosing color and surface type.

## Overview

The user flow:
1. Select a **color** (from `paint_color` metaobjects)
2. Select a **surface type** (from `paint_type` metaobjects)
3. See the **matching product(s)** and go to purchase

---

## Steps

### Step 1 — Add metafield definitions to products ✅
- [x] Create a `paint_color` metafield on products (type: `metaobject_reference` → `paint_color`)
- [x] Create a `paint_type` metafield on products (type: `metaobject_reference` → `paint_type`)
- [x] Already configured in Shopify admin

### Step 2 — Assign metafields to products ✅
- [x] Review existing products in the store (4 products)
- [x] Assign `paint_type` to all products via script
- [x] Assign `paint_color` to all products via script
- [x] Added `type_prefix` field to paint_type metaobject

### Step 3 — Explore the current theme ✅
- [x] Identified theme: Horizon (Shopify), custom CSS, ES Modules
- [x] Studied existing custom sections (kmeconsulting-* pattern)
- [x] Section structure: HTML + inline `<style>` + `{% schema %}` + external JS via `script_tag`

### Step 4 — Build the Liquid section ✅
- [x] Created `sections/kmeconsulting-product-finder.liquid`
- [x] Step 1 UI: color grid from `shop.metaobjects.paint_color`
- [x] Step 2 UI: surface type buttons from `shop.metaobjects.paint_type`
- [x] Step 3 UI: matching product cards with link to buy
- [x] Section schema with collection picker, color scheme, padding settings

### Step 5 — Add interactivity ✅
- [x] Created `assets/kmeconsulting-product-finder.js`
- [x] Step navigation (next/back) with scroll
- [x] Product filtering via embedded JSON data
- [x] No-match state ("Vi har desværre ikke et produkt...")
- [x] Reset/start over button

### Step 6 — Styling ✅
- [x] Matches existing theme (CSS variables, border-radius, transitions)
- [x] Responsive grid (3 cols mobile → 4 cols desktop for colors)
- [x] Step indicator bar (1 → 2 → 3)

### Step 7 — Testing
- [ ] Push to theme and test in the Shopify customizer
- [ ] Verify color + type combinations return correct products
- [ ] Test on mobile
- [ ] Test with no matching product (edge case)

---

## Files created

| File | Purpose |
|---|---|
| `sections/kmeconsulting-product-finder.liquid` | The section (Liquid + CSS + schema) |
| `assets/kmeconsulting-product-finder.js` | Step navigation and product filtering |

## Current status

**Ready for testing — push to theme and add section via customizer**
