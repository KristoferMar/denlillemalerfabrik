# Plan — Udvid søgefunktionen så man kan søge "generisk"

Airtable todo: recIZdw7Hzx0kXtEg (P1, order 22)
Classification: **Code-only**

## Current state

- Search lives in the front-page product finder (todo recFNVYW6ZlF37awn):
  - `sections/kmeconsulting-product-finder.liquid` — Søg pill + collapsible panel, input placeholder "Søg på farve, navn eller DLM-kode…" (line ~142).
  - `assets/kmeconsulting-product-finder.js` — `matchesSearch()` (lines 179–196) does plain substring match of the whole query against: color name, DLM code (±prefix), hex (±#), English family name, Danish family label.
- Consequences today:
  - "orange" works *only* because it substring-matches the family label "Oranges"/"Orange".
  - "lyse farver" matches nothing (no color is named that, and "farver" kills any substring match).
  - Generic terms that aren't family names — "turkis", "beige", "creme", "mørk", "pastel" — return nothing unless they happen to appear in a color name.
- Each swatch carries `data-color-hex`, so lightness/hue can be derived client-side; no data model changes needed.

## Proposed changes

All in `assets/kmeconsulting-product-finder.js`, plus one placeholder string in the section liquid.

1. **Tokenize the query.** Split on whitespace; every token must match (AND across tokens). Treat "farve"/"farver"/"i"/"og" as stopwords so "lyse farver" ≡ "lyse".
2. **Generic keyword layer.** Per token, match = (existing substring match) OR (generic predicate match). Predicates computed once per swatch from `data-color-hex` (hex → HSL, cached):
   - **Lightness:** `lys`/`lyse` → L ≥ ~0.75; `mørk`/`mørke` → L ≤ ~0.35; `pastel` → L ≥ 0.75 and S ≤ 0.35.
   - **Generic hues (hue/sat/lightness bands):** rød, orange, gul, grøn, turkis, blå, lilla/violet, rosa/pink/lyserød, brun, beige/sand, creme, grå, hvid, sort. English aliases (red, blue, …) map to the same predicates.
   - Family fallback: tokens that match a family label (EN or DA) keep working as today.
3. **Placeholder update** in `sections/kmeconsulting-product-finder.liquid`: "Søg fx 'lyse farver', 'orange' eller DLM-kode…".
4. No changes to Shopify data, metaobjects, the variant map, or the Liquid grid markup.

Scope: 1 JS file + 1 placeholder string. The 216-swatch grid re-filters synchronously as today; HSL classification is O(216) once.

## Risks / open questions

- **Hue-band boundaries are judgment calls** — e.g. where beige ends and brun begins, whether a desaturated blue counts as grå. Thresholds will be tuned against the actual 216-color palette, but a few colors may classify surprisingly; easy to tweak constants afterwards.
- **Hex values are approximations** (noted in earlier todos), so classification inherits that imprecision.
- "lyse farver" combined with an active family pill intersects (consistent with current behavior) — assumed desired.
- Stopword list is minimal by design; can extend if you want phrases like "varme farver" (currently out of scope unless approved).

## Verification

- Manual checks against the rendered grid: "orange", "lyse farver", "mørke", "turkis", "beige", "lyse blå", plus regression of existing searches (name, DLM code ± prefix, hex ± #, family, Esc/×-clear, collapse-restore).
- `npm run lint` / `npm run build` if present; git diff shown before commit.
