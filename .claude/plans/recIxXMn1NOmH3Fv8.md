# Plan — Identify generic colors missing from DLM (compared to File Under Pop)

Airtable: `recIxXMn1NOmH3Fv8` · P1 · Order 9
Title: *Kig på farver fra file by pop og identificer hvilke vi mangler*
Classification: **Hybrid** — JSON in repo + Shopify `paint_color` metaobjects (+ optional UI wiring in code).

## Current state

### Data layer
- Single source of truth: `docs/colors/dlm-colors-with-ncs.json` — **200 colors** in 8 families × 25 shades each. Schema per entry: `{ handle, dlm_id (DLMxxyy), ncs_code, name_da, display_hex, family }`. DLM coding scheme: `xx` = family digit 01–08, `yy` = shade 01–25 (light → dark).
- Existing families (English id → Danish label, picked from `sections/kmeconsulting-product-finder.liquid`):
  - `Whites` → Hvid, `Blues` → Blå, `Greys` → Grå, `Greens` → Grøn, `Warm Neutrals` → Varm Neutral, `Yellows / Sands` → Gul, `Pinks / Coppers` → Rosa, `Reds / Browns` → Rød
- Shopify mirror: `paint_color` metaobject definition (`gid://shopify/MetaobjectDefinition/25049989506`) with fields `name`, `dlm_code`, `hex_color`, `color_family`, `ncs_code`. **200 entries** populated, handles `dlm0101`…`dlm0825`. Confirmed via `metaobjects(type: "paint_color", first:250)` — all families/handles match the JSON.
- Sync: `scripts/sync-colors-to-shopify.mjs` reads JSON → upserts metaobjects → rebuilds the shop-level `custom.paint_palette` list metafield (`list.metaobject_reference`) in JSON order. Re-runs are idempotent.

### UI / theme
- `snippets/paint-colors-data.liquid` — header says auto-generated, but the sync script does NOT regenerate it (it has been hand-edited previously). Hardcodes 8 family arrays (`whites_arr`, `blues_arr`, `greys_arr`, `greens_arr`, `neutral_arr`, `yellow_arr`, `pink_arr`, `red_arr`) as `~~`-joined strings.
- `sections/kmeconsulting-product-finder.liquid` — hardcodes the 8-family list in two places (`families = '…' | split: ','`, `family_labels = '…' | split: ','`), plus per-family `fam_accent` `case` and per-family `fam_arr` `case`. Eyebrow text reads `VORES FARVER · 200 NUANCER`.
- `assets/kmeconsulting-product-finder.js` — `familyDanishLabel` map of all 8 English→Danish labels (used by the search panel).
- `templates/page.catalogue.json` — one `color_family` section per family (8 blocks).

### File Under Pop palette (researched via Chrome)
Their 105-color collection has clear coverage of:
- **Purples / violets** — Violet Hair, Electric Indigo, Purple Fame, Hyacinth, Purple Trace, Black Orchid
- **Pure oranges** — Tangerine Philosophy, Orange Rush, Sunset
- **Pure blacks** — Black Swan
- Plus reds/pinks/greens/blues/yellows/whites/greys — already well covered in DLM.

### Gaps in DLM vs File Under Pop & generic color theory
1. **No purple/violet family at all** — confirmed; user called out "lilla" explicitly.
2. **No pure-orange family** — current "oranges" sit inside Pinks / Coppers (Mandarin, Korall, Aprikosflamme) or Yellows / Sands (Aprikos, Sennep). User called out "orange" explicitly.
3. **No black/charcoal family** — darkest DLM grey is `DLM0325 Kullgrå #565656`; no true near-black.
4. (Lower-priority but worth flagging:) no dedicated **turquoise / teal** (sits between Blues and Greens — partial coverage by existing Blues 0211 Akvamarin and Greens 0411 Eukalyptus).

## Proposed changes

### Scope decision — please pick A or B (default A unless told otherwise)

**Option A (recommended, full hybrid).** Add 3 new families with 16 new colors total → data layer + UI wiring + Shopify metaobjects. Eyebrow becomes `216 NUANCER`. Theme grid grows to 11 family columns.

**Option B (data-only).** Same 16 new colors in JSON + Shopify metaobjects only. **No UI changes** — they exist in the database but don't appear in the front-end product-finder yet. UI wiring becomes a separate follow-up todo.

### Proposed 16 new colors (same set for A & B)

**Purples / Violets — family code 09 (7 colors, DLM0901–0907)**

| DLM | Name (da) | NCS | Hex |
|---|---|---|---|
| DLM0901 | Lavendel | S 1020-R60B | #E5DCE8 |
| DLM0902 | Syren | S 2020-R50B | #D4C2DD |
| DLM0903 | Lilla | S 3030-R50B | #B68FCC |
| DLM0904 | Violet | S 4040-R50B | #8C5FB0 |
| DLM0905 | Amethyst | S 5040-R50B | #7A4A8F |
| DLM0906 | Aubergine | S 7020-R30B | #4A2A4D |
| DLM0907 | Plomme | S 8010-R30B | #3B1F3F |

**Oranges — family code 10 (5 colors, DLM1001–1005)**

| DLM | Name (da) | NCS | Hex |
|---|---|---|---|
| DLM1001 | Apricot Glød | S 1040-Y50R | #FAB78A |
| DLM1002 | Klar Mandarin | S 2060-Y40R | #F39A4E |
| DLM1003 | Klar Orange | S 1080-Y40R | #F07A1E |
| DLM1004 | Græskar | S 2080-Y40R | #D86813 |
| DLM1005 | Brændt Orange | S 4050-Y50R | #B7541C |

**Blacks / Charcoals — family code 11 (4 colors, DLM1101–1104)**

| DLM | Name (da) | NCS | Hex |
|---|---|---|---|
| DLM1101 | Soft Black | S 8500-N | #3A3A38 |
| DLM1102 | Onyx | S 9000-N | #2A2A28 |
| DLM1103 | Midnat | S 9500-N | #1A1A1C |
| DLM1104 | Sortkul | S 9500-N | #0E0E0E |

Danish labels for UI filter pills: `Lilla`, `Orange`, `Sort`.

### Concrete edits (Option A)

Data:
1. Append 16 entries to `docs/colors/dlm-colors-with-ncs.json`.
2. Update `snippets/paint-colors-data.liquid` — add `purple_arr`, `orange_arr`, `black_arr`.

Section liquid (`sections/kmeconsulting-product-finder.liquid`):
3. Extend `families` to 11 entries; extend `family_labels` with `…,Lilla,Orange,Sort`.
4. Add 3 new `fam_accent` `when` branches.
5. Add 3 new `fam_arr` `when` branches.
6. Extend `max_rows` `if`-chain with the 3 new arrays.
7. Change eyebrow text from `200 NUANCER` → `216 NUANCER`.

JS (`assets/kmeconsulting-product-finder.js`):

8. Add the 3 entries to `familyDanishLabel`.

Template (`templates/page.catalogue.json`):

9. Add 3 new `color_family` blocks (Lilla, Orange, Sort) with section ids and Danish descriptions.

Shopify (via MCP):

10. Create 16 new `paint_color` metaobjects (handles `dlm0901`…`dlm1104`), all 5 fields populated.
11. Refresh `shop.custom.paint_palette` list metafield to include the new GIDs at the end (preserve current 200 first, then append 16).

### Concrete edits (Option B, data-only)
Steps 1 and 10–11 only. Skip everything else; create a follow-up Airtable todo for the UI wiring.

## Risks / open questions

- **Naming.** I made up the Danish names (e.g. `Lavendel`, `Klar Orange`, `Soft Black`). Want me to use different names or have you pick?
- **NCS codes.** These are approximated to match the hex — they are not lifted from a Jotun spec sheet. If the customer needs exact Jotun-matched NCS values, this needs a manual cross-check. (Prior 200-color sync used approximated NCS the same way.)
- **Hex values.** Picked to be generic/representative, not Jotun-spec. Same caveat as NCS.
- **Family count = 11 → wider grid.** The product-finder grid is CSS-grid-driven by an inline 8-column assumption. I'd verify the CSS handles 11 columns gracefully (or switch the eyebrow + grid to be data-driven). If grid layout breaks at 11 columns, fallback is to fold purples/oranges/blacks into existing families (less clean architecturally).
- **`paint-colors-data.liquid` is not regenerated by the sync script.** Either I hand-edit it (consistent with current state) or extend the script. I'll hand-edit unless you want script-ification rolled in.
- **`paint_palette` ordering.** Appending at end is safest; matches dlm_id sort.
- **Out of scope (separate todos):** wiring these colors to product variants, generating Colorlab preview images for the new shades, and updating Farvekatalog page descriptions for the new families.

## Verification plan

- After JSON edit: re-load `docs/colors/dlm-colors-with-ncs.json`, confirm `len == 216`, families count, handle uniqueness.
- After metaobject creates: re-query `metaobjects(type:"paint_color")` filtered to new handles, show before/after.
- After list metafield set: re-fetch `shop.metafield(namespace:"custom", key:"paint_palette")` and assert value length 216.
- Code: `git diff` of the touched files inline + lint/build exit statuses.

---
**Approve plan?** (Reply with "A" or "B" plus any name/hex/NCS adjustments. Default if approved without notes: Option A with the names/values above.)
