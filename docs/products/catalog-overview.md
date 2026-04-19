# Catalog Overview

A practical reference for the Den Lille Malerfabrik product catalog: what we sell, how it's categorized, and which tags mean what. Use this when you need to quickly orient yourself or explain the structure to someone else.

> **Data source:** `products-export.md` — last fresh export 2026-04-18 20:57
> **Applied on top:** changes announced in chat on 2026-04-18 (see "Recent changes" below). Re-run `node scripts/products/export-all-products.js` to refresh.

---

## Quick reference

| Section | Parent products | Notes |
|---|---|---|
| Main paint line | 16–19 | Color-matched decorative paints. 32 colors × 3 sizes per product. |
| Specialblanding | 6 | Custom-mix base, 1 per paint-type. |
| Sortiment (teknisk) | 41 | Specialty / technical coatings, 8 kategorier. |
| Legacy | 4 | Untagged DLM products (pre-restructure). Decide whether to migrate or retire. |
| Lars Frey | 108 | External vendor — brushes, rollers, tape, sanding. |

Exact numbers to be confirmed with the next fresh export.

---

## Recent changes (not yet in the last export)

- **Vægmaling Glans 7** — deleted (customer cannot produce Glans 7 for Vægmaling)
- **Vægmaling Glans 20** — deleted (customer does not produce Glans 20 for Vægmaling; it is produced for Tag/Facademaling)
- **Vægmaling Glans 10** — sizes adjusted from `5 L / 10 L / 20 L` → `3 L / 10 L` to match customer sortiment
- **Strukturmaling** — one product deleted, the other renamed to plain `Strukturmaling` (glans removed from display, matching competitor UX). *Which of the three original Strukturmaling products survived needs verification — see to-do.*

---

## The two taxonomies

The catalog runs on two parallel category systems. Know which one you're looking at.

### 1. Main paint line → the decorative color range

**Axis:** paint-type × glans × color × size. Each parent product is one *paint-type at one glans level*; inside it you pick color + size. Every parent product offers the same 32-color palette in 5 L / 10 L / 20 L (with one exception, see below).

**Tag shape:** `paint`, `paint-type:{type}`, `paint-type-prefix:{nn}`, `glans:{n}`.

### 2. Sortiment → the specialty/technical catalog

**Axis:** kategori × product × size. Each product is a single formulation; the glans (if any) is encoded in the product name, not as a variant. One 10 L bucket, or a 2,5 L tin — not 32 colors.

**Tag shape:** `sortiment`, `kategori:{name}`, `enhed:{unit}`.

They share some names (e.g. `Strukturmaling` exists as both a sortiment product and a paint-line product). That's intentional: they are different SKUs with different pricing and use cases. Don't conflate them.

---

## Main paint line

All six paint-types exist. Colors (32) and sizes (5 L / 10 L / 20 L) are uniform unless noted.

| Paint-type | Kode | Glans levels in catalog | SKUs per product |
|---|---|---|---|
| Vægmaling | 10 | `5`, `10` ¹ | 96 (32 × 3) — except Glans 10 which is 64 (32 × 2) |
| Loftmaling | 20 | `2`, `5` | 96 |
| Træ & Metal | 30 | `10`, `20`, `30`, `40`, `60` | 96 |
| Strukturmaling | 40 | *(consolidated — see Recent changes)* | 96 per remaining product |
| Træbeskyttelse | 50 | `10`, `20`, `40` | 96 |
| Gulvmaling | 60 | `30`, `40`, `60` | 96 |

¹ Glans 7 and Glans 20 were deleted for Vægmaling in this session.

### Vægmaling — sizing exception

Vægmaling Glans 10 ships in **3 L and 10 L** (not the standard 5 L / 10 L / 20 L). This is the only paint-line product with non-standard sizing and reflects what the customer will actually produce at that glans level. Worth being deliberate about: either accept this as a one-off, or align the rest of the Vægmaling line to match.

### Pricing bands

| Paint-type | 5 L | 10 L | 20 L |
|---|---|---|---|
| Vægmaling | 299 | 499 | 899 |
| Loftmaling | 279 | 469 | 849 |
| Træ & Metal | 329 | 549 | 979 |
| Strukturmaling | 349 | 579 | 1.029 |
| Træbeskyttelse | 359 | 599 | 1.049 |
| Gulvmaling | 369 | 619 | 1.099 |

Price does not vary by color, only by size and paint-type. Prices are placeholders pending final customer sign-off.

---

## Specialblanding (custom base)

One product per paint-type; used for custom color mixing. 3 variants (5 L / 10 L / 20 L). Tagged `paint` + `specialblanding` + `specialblanding-type:{type}`. Priced 70–100 DKK above the corresponding standard product to cover blending.

| Specialblanding — | Type tag | 5 L | 10 L | 20 L |
|---|---|---|---|---|
| Vægmaling | `vaegmaling` | 399 | 649 | 1.149 |
| Loftmaling | `loftmaling` | 379 | 619 | 1.099 |
| Træ & Metal | `trae-og-metal` | 429 | 689 | 1.229 |
| Strukturmaling | `strukturmaling` | 449 | 719 | 1.279 |
| Træbeskyttelse | `traebeskyttelse` | 459 | 729 | 1.299 |
| Gulvmaling | `gulvmaling` | 469 | 759 | 1.349 |

---

## Sortiment (teknisk) — 41 products in 8 kategorier

Each kategori maps 1:1 to the customer's `sortiment.xlsx`. Size is listed per product; unit is `L` unless otherwise noted.

### `kategori:spartel-forbehandling` — 10 products
Filler, pre-treatment, grunding oils.

| Product | Sizes | Pris (DKK) |
|---|---|---|
| Sandspartel Fin | 5 L / 10 L | *needs pricing* |
| Sandspartel Medium | 10 L | *needs pricing* |
| Letspartel (Finish) | 5 L | *needs pricing* |
| Vådrumsspartel | 10 L | *needs pricing* |
| Microdispers (blåtonet, inde/ude) | 10 L | 875 |
| Microdispersgrunder (tixotropisk) | 2,5 L | 219 |
| Microdispers Microgrunder (hvidpigmenteret) | 10 L | 500 |
| Grundingsolie vandig | 5 L / 10 L | 250 – 500 |
| Grundingsolie vandig (industri) | 20 L | 750 |
| Alkyd træ grundingsolie | 5 L / 20 L | 500 – 1.750 |

### `kategori:vaeg-loft` — 4 products
Indendørs væg- og loftsprodukter (one-formulation, not the decorative paint line).

| Product | Sizes | Pris (DKK) |
|---|---|---|
| Loft- & vægmaling Glans 5 | 3 L / 5 L / 10 L | *needs pricing* |
| Vægmaling Køkken & Bad Glans 25 | 3 L / 5 L / 10 L | 0 – 900 (needs review) |
| Vandskuringsmaling | 10 L | 500 |
| Strukturmaling | 10 L | 500 |

> Note: `Vægmaling Glans 10` used to live here; it has since been moved into the main paint line.

### `kategori:trae-metal` — 2 products
| Product | Sizes | Pris (DKK) |
|---|---|---|
| Akryl emalie Glans 40 | 1 L / 3 L | 225 – 638 |
| PU gulvlak | 10 L | 1.025 |

### `kategori:traebeskyttelse-olie` — 8 products
Wood protection and oil products (separate from the main-line *Træbeskyttelse*).

| Product | Sizes | Pris (DKK) |
|---|---|---|
| Træbeskyttelse heldækkende (alkyd/olie) | 2,5 L / 5 L | 313 – 563 |
| Træbeskyttelse heldækkende (vandig) | 5 L | 625 |
| Transparent træbeskyttelse | 5 L | 438 |
| Transparent træbeskyttelse (tixotropisk) | 5 L | 438 |
| Træterrasseolie (olie-baseret) | 5 L | 313 |
| Træolie 40 (olie-baseret) | 2,5 L / 5 L | 250 – 438 |
| Ædeltræsolie (gylden) | 5 L | 563 |
| Universal heldækkende (olie-baseret) til træ/sten/eternit | 5 L | 563 |

### `kategori:mur-facade-tag` — 8 products
Udendørs: mur, facade, tag.

| Product | Sizes | Pris (DKK) |
|---|---|---|
| Mur & facademaling (akryl/olie) | 5 L / 10 L | 625 – 1.000 |
| Tag & facademaling | 10 L | 750 |
| Tag & facademaling Glans 20 | 10 L | 875 |
| Tagmaling Glans 20 (sort glans 60) | 20 L | 1.500 |
| Tagmaling Glans 10 | 20 L | 1.500 |
| Tagmaling aluminium Glans 60 | 20 L | 2.000 |
| Tag & sokkelmaling | 2,5 L / 5 L | 219 – 438 |
| Tagflex (gummimaling) | 20 L | 1.500 |

### `kategori:rens` — 2 products
| Product | Sizes | Pris (DKK) |
|---|---|---|
| Husrens Plus 9,9% | 5 L | 125 |
| Universalrens koncentrat 50% | 20 L | 1.250 |

### `kategori:epoxy` — 2 products
Enhed: `kg`.

| Product | Sizes | Pris (DKK) |
|---|---|---|
| LF-Epoxy Klar | 16 kg sæt | 1.875 |
| LF-Epoxy Primer upigmenteret | 15 kg sæt | 2.875 |

### `kategori:vaegbeklaedning` — 5 products
Varying units: `m/rl`, `m²`, `rl`, `L`.

| Product | Sizes | Pris (DKK) |
|---|---|---|
| Glasfilt | 25 m / 50 m | *needs pricing* |
| Glasvæv | 25 m / 50 m | *needs pricing* |
| Magnetisk filt Mag+ | 2,5 m² / 5 m² / 10 m² | *needs pricing* |
| Rutex savsmuldstapet | 1 rulle | *needs pricing* |
| Vævlim | 3 L / 12 L | *needs pricing* |

---

## Legacy products (4)

Untagged DLM products from before the restructure. Currently orphaned — not in the main paint line, not in the sortiment.

| Title | Price | Inventory |
|---|---|---|
| Træ Glans 40 | 1.250 | 20 |
| Interiør Glans 5 | 1.250 | 20 |
| Interiør glans 10 blå | 1.250 | 20 |
| Loft glans 25 | 1.250 | 20 |

These are the only products currently showing non-zero inventory (20 each). Decision needed: migrate each into the new glans-based paint line, move into the sortiment, or retire.

---

## Lars Frey tilbehør (108 products)

External vendor. Brushes, rollers, tape, sanding, tools. Managed via loose bare tags rather than key:value pairs.

| Tag | Count |
|---|---|
| Pensler | 18 |
| Tape | 15 |
| Ruller | 14 |
| Sandpapir | 14 |
| Tilbehør | 12 |
| Værktøj | 12 |
| Øvrige produkter | 19 |
| Diverse | 17 |
| Mest solgte | 8 |
| Rondeller | 6 |
| Slibepapir | 6 |
| Afdækning | 6 |
| Other sub-brands | Gemini (5), Syntetisk (4), Soft (4), Mix (4), Rullehåndtag (4), Malerbakker (3), Anstrygere (2), Spartler (2), Natur (1), Handsker (1) |

Full list in `docs/products/products.md`.

---

## Color palette — 32 colors

Same palette across the entire main paint line. Codes use the `DLM{FF}{SS}` system (family + shade).

| Family | Colors |
|---|---|
| 01 Whites | Snehvid, Porcelæn, Kalkhvid, Cremehvid |
| 02 Blues | Isklar, Himmellys, Havbrise, Dybhav |
| 03 Greys | Sølvtåge, Drivsten, Granitgrå, Skifergrå |
| 04 Greens | Morgendug, Mynte, Salvie, Skovdybde |
| 05 Warm Neutrals | Elfenben, Havremel, Nougat, Valnød |
| 06 Yellows / Sands | Strandlys, Klitsand, Ravgul, Karamel |
| 07 Pinks / Coppers | Rosendug, Solnedgang, Kobber, Terracotta |
| 08 Reds / Browns | Rødler, Murstensrød, Kastanje, Mørk Jord |

See [`docs/colors.md`](../colors.md) for full hex codes and [`docs/dlm-color-code-system.md`](../dlm-color-code-system.md) for how codes compose with paint-type prefixes.

---

## Tag reference cheat sheet

### Main paint line (paint products)
| Tag | Example | Meaning |
|---|---|---|
| `paint` | `paint` | Flag: this is a main-line paint product |
| `paint-type:{type}` | `paint-type:vaegmaling` | Paint-type slug |
| `paint-type-prefix:{nn}` | `paint-type-prefix:10` | 2-digit prefix (used in full color code) |
| `glans:{n}` | `glans:5` | Gloss level (integer) |
| `specialblanding` | `specialblanding` | Flag: this is a custom-mix base |
| `specialblanding-type:{type}` | `specialblanding-type:vaegmaling` | Which paint-type the blend targets |

### Sortiment (teknisk)
| Tag | Example | Meaning |
|---|---|---|
| `sortiment` | `sortiment` | Flag: this is a sortiment product |
| `kategori:{name}` | `kategori:vaeg-loft` | One of 8 kategorier |
| `enhed:{unit}` | `enhed:L` | Unit of measure (L, kg, m, m², m/rl, rl) |

### Kategorier (all values)
`spartel-forbehandling` · `vaeg-loft` · `trae-metal` · `traebeskyttelse-olie` · `mur-facade-tag` · `rens` · `epoxy` · `vaegbeklaedning`

### Lars Frey
Bare tags only (no key:value). The vendor name `Lars Frey` is itself a tag on every product in this line.

---

## Related scripts

Located in `scripts/products/`.

| Script | Purpose |
|---|---|
| `export-all-products.js` | Refresh `products-export.md` from Shopify |
| `create-paint-products.js` | Create main-line paint products from scratch |
| `create-sortiment-products.js` | Create sortiment products from config |
| `restructure-paint-by-glans.js` | Migrate color-based paint products → glans-based |
| `toggle-paint-type.js` | Enable/disable products by tag (e.g. `paint-type:vaegmaling`) |
| `add-glans-variants.js` | Add a new glans level to an existing paint-type |
| `audit-color-products.js` | Sanity check colors / codes / tag consistency |
| `set-inventory.js` | Bulk set inventory on variants |
| `inspect-color-product.js` | Dump a single product's metadata for debugging |

See `scripts/SETUP.md` for auth and environment variables.
