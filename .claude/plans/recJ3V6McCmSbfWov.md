# Nye farver — palette expansion 32 → 200

Airtable record: recJ3V6McCmSbfWov

## Approach

- Keep the existing 8-family structure. Expand each family from 4 shades to 25 shades, giving 8 × 25 = **200 colors** total.
- The existing 32 entries are **frozen**: same DLM code, same friendly name, same Hex. They are not edited or re-ordered. This protects every SKU currently in Shopify (`DLM{paintTypePrefix}-{FFCC}-G{glans}-{size}L`).
- The 21 new shades per family take codes `FF05` through `FF25` within their family (so the new whites are DLM0105–DLM0125, new blues are DLM0205–DLM0225, etc.). Code `FF` matches the existing family numbering (01 whites, 02 blues, …, 08 reds/browns).
- Hex generation: for each family, convert the 4 existing anchors to HSL, sort by lightness, build a 25-point lightness ramp covering the family's range (slightly extended on the lighter and darker ends), and interpolate hue + saturation between neighbouring anchors. The 4 existing anchors are pinned to their current Hex values exactly. The 21 new entries fill the gaps and the extensions.
- Friendly names: thematic Danish nature / material / weather names that fit each family's tone — same register as the existing anchors (Snehvid, Himmellys, Skifergrå, Mynte, …). Hand-curated, not numbered.
- Each row gets a new empty `NCS` column. Hex stays. The schema becomes: `Code | Name | NCS | Hex`. NCS to be backfilled later from DLM.
- One run-once Python script under `scripts/generate-colors.py` produces the interpolated Hex values from the anchor hexes. The script is committed for reproducibility; running it again produces identical output for the existing anchors (idempotent on the anchors).

## Files likely to change

- `docs/colors.md` — rewritten with all 200 rows across 8 family tables, plus a short intro paragraph explaining the schema and the NCS-pending status. Verified to exist.
- `scripts/generate-colors.py` — **new file**. The Hex-interpolation script. ~80 lines. Python stdlib only (`colorsys`), no deps.

(Out of scope this session: any Shopify mutation, any storefront/theme change, any variant additions, the Color metaobject design. This todo updates the source-of-truth docs file only.)

## Risks / open questions

- **Naming style.** I'm proposing thematic Danish nature/material names hand-picked per shade — same register as the existing anchors. The alternative is systematic names like "Hvid 05, Hvid 06, …" which are uglier but cheaper to verify. Going with thematic unless you want otherwise.
- **Hex extrapolation past the existing anchor range.** A few families (e.g. Whites) have all 4 anchors very close in lightness; the 21 new shades will need to spread further than the existing 4, which means slightly lighter and slightly darker variants than anything in the current palette. That's intentional, but you may want to constrain "no darker than the current darkest" — flag if so.
- **NCS column.** New schema is `Code | Name | NCS | Hex`. Adding NCS as an empty column today means every existing row gets `—` in NCS. Acceptable, or prefer to defer the schema change until NCS data lands?
- **Code allocation.** 200 colors fits within `FF01`–`FF25` (8 × 25). If DLM ever wants more than 25 shades per family, the 4-digit `FFCC` scheme still has room (up to `FF99`).
- **No Shopify side-effects yet.** This change updates the docs only; Shopify still only knows the original 32 colors. A separate todo will be needed to actually create the new variants and the Color metaobject.

approve plan?
