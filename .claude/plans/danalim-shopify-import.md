# Plan: Import Danalim products into Shopify

Source: `docs/products/danalim/danalim-products.json` (91 rows).
Goal: 61 Shopify products created (rows collapsed by code + colour into multi-size variants).

## Conventions to inherit from existing Lars Frey products

Surveyed `tag:"Lars Frey"` products (e.g. `Jumbopensel ECO`) — they use:

- `vendor` = external supplier name ("Lars Frey Farve og Lak")
- `productType` = one of DLM's existing Danish types ("Tilbehør", "Spartel & forbehandling", "Vægbeklædning")
- `tags` = [vendor-name plain tag, functional category tags]
- SKU = supplier's own SKU
- Status: ACTIVE
- Variant axis: size / dimension

Shop is DKK with `taxesIncluded: true`, so the `retail_price_incl_vat_dkk` column from
the spreadsheet maps **directly** to Shopify's price field.

## Field mapping (proposed)

| Shopify field      | Source                                                                 |
|--------------------|------------------------------------------------------------------------|
| `vendor`           | `"Danalim"`                                                            |
| `productType`      | per category: Sandspartel/Rullespartel/Ude spartel/Træspartel/Sparteltape → `Spartel & forbehandling`; Acrylfugemasse/Kit/Fugepistol → `Tilbehør`; Vævlim/Vådrumslim/Tapetlim/Glasfilt/Glasvæv/Vævfylder → `Vægbeklædning` |
| `tags`             | `["Danalim", "kategori:<slug>", "enhed:<unit>"]`                       |
| `title`            | Stem of product name with code (e.g. `Filler Indendørs 611`, `Plastisk Træ 638 Eg`) |
| `handle`           | auto from title                                                        |
| `status`           | **DRAFT** initially (await user QA before activating)                  |
| Variant `title`    | Size string (e.g. `1,5 kg`, `10 L`)                                    |
| Variant `price`    | `retail_price_incl_vat_dkk`                                            |
| Variant `compareAtPrice` | none                                                              |
| Variant `sku`      | none initially — we don't have Danalim variant SKUs                    |
| Inventory          | tracked, qty=0 (matches existing DLM convention)                       |
| `media`            | repo image paths from `images` field (54 of 91 rows mapped)            |
| Metafields         | `custom.danalim_category` (text), `custom.danalim_code` (text)         |
| Description        | none initially (filled in later)                                       |

## Grouping (91 rows → 61 Shopify products)

- 20 multi-variant products (same code + colour, multiple sizes)
- 41 single-variant products

Notable choices:

- **Plastisk Træ 638**: 3 Shopify products (Eg, Natur, Teak). Eg and Natur each have 2 sizes
  (75ml, 250g); Teak has only 75ml. Keeping colour as separate products matches how the
  spreadsheet enumerates them.
- **Danaseal Interior 521**: 4 products, one per NCS code (Hvid S 0500 N, S-0502Y, 1803-Y33-R,
  3003-Y41-R). NCS colour is the meaningful differentiator.
- **Termokit 684**: 3 products (Brun, Hvid, Lysegrå) — colour is the primary axis;
  treating the spreadsheet's `Lysegrå`/`Lysgrå` typo variants as the same colour.
- **Glasfilt / Glasvæv**: 6 separate single-variant products (each row is a distinct
  quality grade — Economy, 1. sort, Flex Grundet, Grundet).
- **Fugepistols**: 7 separate single-variant products (no spreadsheet size column for these).

## Images

54 of 91 rows already have repo paths in the `images` array. Image upload requires either:

1. Hosting the images publicly so Shopify can fetch by URL, or
2. Using `stagedUploadsCreate` + multipart upload, then `productCreateMedia`.

Plan: use staged uploads — fully programmatic, no external hosting needed.
Failed image uploads are reported but don't block product creation.

## Idempotency

Tag every created product with `Danalim` plus a `danalim-row:<index>` tag during the run
so a re-run can detect already-imported rows and skip them. Also save a per-row mapping
file `docs/products/danalim/import-state.json` capturing `{ row_index: { product_gid,
created_at, status } }` so the run is resumable.

## Order of operations

1. Build the 61 grouped product specs in memory (no API calls)
2. Dry-run print the full preview (titles, types, tags, variants, prices, images) for
   user review — *Wait for me checkpoint*
3. Create 5 products as a smoke test (one multi-variant, one with NCS colour, one with
   images, one fugepistol, one single-variant) — *Wait for me checkpoint*
4. Create the remaining 56
5. Read back all 61, verify counts, and report

## Risks / open questions

- **Status DRAFT vs ACTIVE**: products in DRAFT are invisible to customers; safer for
  review. Lars Frey products are all ACTIVE.
- **Vendor field "Danalim" vs "Den Lille Malerfabrik"**: I'd default to `Danalim` to match
  the Lars Frey convention, but DLM occasionally uses themselves as the vendor on all
  products (the Specialblanding line does). Pick one.
- **Inventory tracking**: track inventory (qty=0) or untracked? Existing DLM paint
  products are tracked.
- **Test run first?**: 5 products as a smoke test before all 61, or full run in one go?
