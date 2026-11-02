# Sync `docs/colors/dlm-colors-with-ncs.json` → Shopify Paint Color metaobjects

Airtable record: recJ3V6McCmSbfWov (continuation — earlier plan covered the JSON authoring; this plan covers the Shopify import).

## Goal

Make the JSON the only source of truth. Shopify holds a complete mirror in the `Paint Color` metaobject (already exists), populated by a re-runnable sync. The storefront and the Color Combination metaobject reference Paint Color by stable handle.

## Discovered state

- **Paint Color metaobject definition exists** (`gid://shopify/MetaobjectDefinition/25049989506`, type `paint_color`). Fields: `name`, `dlm_code`, `hex_color`, `color_family` — all `single_line_text_field`, none required. **Missing `ncs_code`.**
- **32 Paint Color entries exist** (one per anchor DLM0101–DLM0804). Random handles (`paint-color-zl5qhcmc` etc.), Danish family names (`Hvid`, `Blå`, …), all four field values populated.
- **168 entries are missing** — the new shades DLM0105–DLM0125, DLM0205–DLM0225, etc.
- **`Color Combination` metaobject (`gid://shopify/MetaobjectDefinition/25172967810`) references Paint Color** via `paint_color_1`…`paint_color_5` fields. These references are by metaobject GID — handle renames will NOT break them.

## Approach

1. **Extend the Paint Color definition** with a new `ncs_code` field (single_line_text_field, not required). One `metaobjectDefinitionUpdate` call.

2. **Update the 32 existing entries** to match the JSON:
   - Match by `dlm_code` field value (e.g., existing "Havbrise" has `dlm_code=DLM0203`, JSON has `dlm_id=DLM0203` → matched).
   - Per entry: rename handle to `dlmNNNN` (lowercase, e.g. `dlm0203`), update `color_family` to English, set `ncs_code` from JSON, leave `name`/`hex_color`/`dlm_code` as-is (they already match).
   - Use `metaobjectUpdate` (keyed on GID). GIDs are preserved, so Color Combination references stay intact.

3. **Create the 168 missing entries** from the JSON:
   - One `metaobjectCreate` per record. Set handle = `dlmNNNN`, plus the five field values.

4. **Verify** by querying back all 200 entries and confirming counts per family.

## Files to change (in customer repo)

- `scripts/sync-colors-to-shopify.mjs` — **new file**, ~150 lines. Node script that:
   - Reads `docs/colors/dlm-colors-with-ncs.json`.
   - Calls the Shopify Admin GraphQL API (using a token from env var `SHOPIFY_ADMIN_TOKEN` and shop domain `SHOPIFY_SHOP`).
   - Idempotent: queries existing Paint Color entries first, then updates by GID where `dlm_code` matches, creates where it doesn't.
   - Re-runnable: running it again with no JSON changes makes zero Shopify writes (after the initial sync settles).
   - Committed to the repo so future edits to the JSON can be re-synced by running `node scripts/sync-colors-to-shopify.mjs`.

For *this session* the actual writes will be done through the Shopify MCP `graphql_mutation` tool (so you can see the results inline). The script is committed for future reruns.

## Field mapping

| JSON field    | Paint Color metaobject field | Notes                                       |
|---------------|------------------------------|---------------------------------------------|
| `handle`      | (metaobject `handle`)        | Set explicitly to `dlmNNNN`                 |
| `dlm_id`      | `dlm_code`                   | Already matches for the 32 existing         |
| `ncs_code`    | `ncs_code` (NEW field)       | Definition update needed first              |
| `name_da`     | `name`                       | Already matches for the 32 existing         |
| `display_hex` | `hex_color`                  | Stored as text (matches existing field type)|
| `family`      | `color_family`               | English values per JSON                     |

## Decisions you need to confirm (open questions)

1. **Family name language.** The JSON has English (`Whites`, `Warm Neutrals`). Shopify has Danish short names (`Hvid`, `Varm Neutral`). The user request is "JSON as the only source of truth", which means Shopify gets overwritten to English. **My recommendation: go English** for consistency. If you'd rather keep Danish in Shopify (for the admin UX), I'll add a `family_da` column to the JSON and have the sync script use that instead.
2. **`hex_color` stays as text** (not the Shopify "color" field type). The existing 32 entries use text, the Color Combination references work fine with text, and changing the field type would require dropping and re-creating the field, which would break the existing 32 entries' values until re-populated. **Recommendation: keep as text.** A future plan can migrate to color type with care.
3. **Renaming existing handles.** 32 existing handles go from `paint-color-xyz` to `dlm0101`-style. Color Combination references are by GID and are safe. Anything else that referenced these handles (theme code? storefront templates?) would break — but I have no evidence of that today. **Recommendation: rename.** Worth a `grep -r 'paint-color-' /Users/kristofermar/development/kunder/denlillemalerfabrik` from your end before approving.

## Risks

- **API rate limits.** 200 mutations is small but not nothing. The Shopify Admin API allows ~100 mutations/sec via cost-bucketed quota. Doing them serially with brief pauses if needed is fine.
- **Partial failure.** If we get halfway and one mutation errors, the script is idempotent by `dlm_code` lookup — re-running picks up the rest. No risk of duplicates.
- **Two color metaobjects in the store.** There's also a Shopify-native `Color` definition (`shopify--color-pattern`, taxonomy-driven). That's the OS-provided one for product color options and is separate; we are not touching it. We're only updating `paint_color`.
- **Out of scope this session:**
  - Wiring product variants' `Farve` option to reference these Paint Color metaobjects (Shopify's "Linked Metaobjects" / color-swatch feature). This is a separate, bigger plan and impacts every colored paint product.
  - Adding the 168 new color variants to the 16 colored paint products. Separate.
  - Migrating `hex_color` field type to color.

## Verification step

After the writes, the script (and a follow-up GraphQL query through the MCP) will:
1. Count Paint Color entries by `color_family` — expect 25 per family, 200 total.
2. Spot-check handles: every entry's handle matches `^dlm0[1-8]0[1-9]$|^dlm0[1-8]1[0-9]$|^dlm0[1-8]2[0-5]$`.
3. Confirm `ncs_code` is non-empty on every entry.

approve plan?
