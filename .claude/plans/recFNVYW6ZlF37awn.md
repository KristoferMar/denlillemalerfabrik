# Søg-knap + all-search felt i hovedkomponent (kmeconsulting-product-finder)

Airtable record: `recFNVYW6ZlF37awn` (Den Lille Malerfabrik, Priority **P3**, Order 19)

> **Title (verbatim):** "I vores main komponent som har overblik over alle farverne skal vi have implementeret en \"søg knap\" til højre for alle farverne."
>
> **Description (verbatim):** "Helt til højre hvor man kan filtrere på farverne skal der være en knap der hedder \"Søg\" med et lille søge icon. Hvis den knap bliver trykket kunne jeg godt tænke mig at der kommer et søgefelt under alle filtermulighederne hvor man kan skrive og søge efter en bestemt farve. Dette søgefelt skal være et \"all search felt\" hvor du både kan søge på farver, navne, dlm ID'er osv."

## Component identified

The "main komponent" referenced is the homepage **`kmeconsulting-product-finder`** section (`sections/kmeconsulting-product-finder.liquid`, registered in `templates/index.json`). It renders the 8-family × 25-shade grid plus the family filter pills row above it.

## Current state

- The filter row lives at `sections/kmeconsulting-product-finder.liquid` lines 57–88: a `<div class="vores-farver__filters" role="tablist">` holding one "Alle" pill plus 8 family pills (Hvid, Blå, Grå, Grøn, Varm Neutral, Gul, Rosa, Rød). CSS at lines 1798–1839 lays them out with `display:flex; flex-wrap:wrap; gap:8px; justify-content:center` and pill styling (`border-radius:100px`, 1.5px border).
- Each swatch button carries the searchable data: `data-color-name` (Danish name), `data-color-code` (e.g. `DLM0042`), `data-color-hex` (e.g. `#F5F0EB`), `data-family` (English family id, e.g. `Whites`). The Danish-label mapping for family is already present in the Liquid (`families` → `family_labels`).
- The grid starts collapsed (`.vores-farver__grid--collapsed` hides items past the first 32 anchor swatches via `:nth-child(n+33)`), toggled by the "Vis flere farver" button.
- Filtering is implemented in `assets/kmeconsulting-product-finder.js` lines 101–154: `applyFamilyFilter(family)` adds/removes the `vores-farver__swatch--hidden` class on each swatch and runs a staggered fade-in.
- No search input exists today.

## Proposed changes

Implement a one-button + one-input search affordance, integrated with the existing family-filter machinery via the same `--hidden` class.

**Liquid markup (`sections/kmeconsulting-product-finder.liquid`):**

1. Restructure the filters row so the family pills are wrapped in their own group and a `vores-farver__filters-actions` group sits at the right edge (using `margin-left:auto` on a small wrapper) holding a new `<button class="vores-farver__search-toggle" aria-expanded="false" aria-controls="vores-farver-search-panel">` with a small magnifier SVG icon + the text "Søg".
2. Directly below the filters row, add a collapsible panel:
   ```
   <div class="vores-farver__search-panel" id="vores-farver-search-panel" hidden>
     <input type="search" class="vores-farver__search-input"
            placeholder="Søg på farve, navn eller DLM-kode…"
            aria-label="Søg i farver" />
     <button type="button" class="vores-farver__search-clear" aria-label="Ryd søgning" hidden>×</button>
   </div>
   ```
3. Add scoped CSS in the section's existing `<style>` block:
   - `.vores-farver__filters` becomes `display:flex` with `flex-wrap:wrap` and an inner group + right-aligned actions group (use `margin-inline-start:auto` so the search button hugs the right edge on wide viewports and wraps below pills on narrow viewports).
   - `.vores-farver__search-toggle` reuses the pill style (same border + radius + hover) with the dot replaced by a 14×14 search SVG icon.
   - `.vores-farver__search-toggle[aria-expanded="true"]` toggles to filled background using existing `--filter-accent` machinery.
   - `.vores-farver__search-panel` slides open with a small max-height transition and centered max-width (≈480px) input. Hidden via the native `hidden` attribute by default; JS removes the attribute on open.
   - Mobile breakpoint: ensure the search-toggle wraps cleanly under the family pills (it already will, because the actions group is just another flex child).

**JS (`assets/kmeconsulting-product-finder.js`):**

1. Add a `searchState` module-local variable plus a `vfActiveSearch` string. Refactor `applyFamilyFilter(family)` slightly so visibility = `(isAll || swFam === family) && matchesSearch(sw)` — single source of truth.
2. Add `matchesSearch(swatch)`:
   - If `vfActiveSearch === ''` → `true`.
   - Otherwise normalize the query (`.trim().toLowerCase()`) and test against a concatenated haystack: `data-color-name`, `data-color-code` (also strip the `DLM` prefix so a query `"0042"` matches `DLM0042`), `data-color-hex` (with and without leading `#`), the English `data-family`, and its Danish label (mapped via a small lookup `{Whites:'Hvid', Blues:'Blå', …}`). All lowercased. Match = `haystack.includes(query)`.
3. Wire the search toggle:
   - Click → flip `aria-expanded`, toggle `hidden` on the panel, focus the input when opening, and clear the query (and re-apply filter) when closing.
4. Wire the input:
   - `input` event (debounced ~80ms via `requestAnimationFrame` is enough — 200 nodes is fine) updates `vfActiveSearch` and re-runs the current family filter.
   - When the query becomes non-empty: remove the `vores-farver__grid--collapsed` modifier so all 200 colors are searched, and hide the "Vis flere farver" button. When the query is cleared: restore the original collapsed state and the "Vis flere farver" button.
   - When the user starts typing, do **not** auto-reset the family filter — let users intersect (e.g. family=Blå + query="havblå"). This matches the user's wording of "all search" without overriding the family choice.
5. The clear button (×) inside the input is shown when the query is non-empty; clicking it empties the input and re-runs the filter.
6. Keyboard: pressing Escape inside the input clears the query; Escape with the panel open and an empty input closes the panel and returns focus to the toggle.
7. Reduced-motion / fade-in: keep the existing staggered fade behavior but cap the stagger more aggressively when the query changes rapidly (already capped at 400ms; fine).

## Files likely to change

- `sections/kmeconsulting-product-finder.liquid` — markup additions for the toggle button + search panel inside `.vores-farver__filters` and its sibling, plus CSS additions in the existing `<style>` block.
- `assets/kmeconsulting-product-finder.js` — refactor the visibility computation, add `matchesSearch`, wire the toggle + input + clear + Escape.

No changes to `snippets/paint-colors-data.liquid`, the variant map, the scenes/inspiration logic, or `scripts/sync-colors-to-shopify.mjs`.

## Risks / open questions

- **Search button placement on mobile.** The filter row already wraps on narrow viewports. With the search toggle pushed right via `margin-inline-start:auto`, on a wrap it will sit alone on its own row, right-aligned. Acceptable — the search input opens directly under the whole row regardless, so the visual hierarchy stays "filters → search affordance → results".
- **Active-family pill highlight while searching.** If the user has a family filter selected and types a query that hides all of that family's swatches, the grid renders empty. Reasonable — same as today when a family has no visible matches. We could add an inline "Ingen farver matcher" hint, but defer unless requested.
- **DLM-prefix matching.** Adopting "strip `DLM` from `data-color-code` before matching" means a query like `"D"` will not match by code (since the prefix is stripped before matching). That is fine — letter `d` will still match `data-color-name` words like "dyb".
- **Hex matching pitfalls.** Allowing partial hex match (e.g. `"F5F"`) will sometimes return surprising sets, but the description explicitly asks for "all search". Accept this as part of the contract.
- **Focus management.** When the panel opens, focus jumps to the input. When it closes via Escape, focus returns to the toggle. Standard a11y pattern — no risk.
- **`<input type="search">` default styling.** Browsers add their own × button. We render our own × inside the panel for consistent styling. Hide the native one via CSS `::-webkit-search-cancel-button { display:none; }`.
- **Out of scope.** Filter persistence (querystring, deep-linking by search), result counts, server-side search, fuzzy/typo-tolerant matching. If requested later, add as a follow-up todo.
