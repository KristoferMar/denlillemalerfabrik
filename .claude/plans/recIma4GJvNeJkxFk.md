# Logo skal flugte 100% med menuen under (recIma4GJvNeJkxFk)

P2 · Code-only · branch `v2`

## Context

Den Lille Malerfabrik header (`sections/header.liquid`) renders as two stacked rows:

- **Top row** (`header__row--top`): left-aligned icon-mark logo (`larsfray-single-logo.svg`) + center wordmark + right-aligned search/localization. Uses `--header-padding: var(--padding-sm)` (≈ 0.7rem each side).
- **Bottom row** (`header__row--bottom`): centered main menu. Uses `--header-padding: var(--padding-xs)` (≈ 0.5rem each side).

Earlier P1 todo `recl9a2robOUwMP3f` set the left logo to `logo_height: 72` / `logo_height_mobile: 56` so it visually filled the **top row** vertically. Lars now wants it **larger** and aligned so its **bottom edge flushes with the bottom edge of the menu row** — i.e. the logo bleeds down from the top row through the divider and lines up flush with the bottom of the entire header.

## Current state

`sections/header.liquid:46-48`

```liquid
capture logo
  render 'header-logo-static', logo_file: 'larsfray-single-logo.svg', extra_class: 'header-logo--left', logo_height: 72, logo_height_mobile: 56
endcapture
```

`snippets/header-logo-static.liquid` outputs `<a class="header-logo header-logo--left" style="--header-logo-image-height: 72px; --header-logo-image-height-mobile: 56px;">` wrapping the SVG `<img>` at 72px tall (desktop).

The left column is `display: flex; align-items: center` inside `header__column--left`, so the 72px logo is vertically centered within the top row only. The bottom row is a separate `<div>` below it; nothing currently bridges them.

`header-group.json` confirms desktop config: `menu_row: bottom`, `logo_position: left`, sticky always-on.

## Proposed changes (desktop only)

Only `sections/header.liquid` is touched (Liquid render call + the `{% stylesheet %}` block in the same file).

1. **Bump the left-logo size** so it visually spans the full header height (top row + divider + bottom row).
   - Desktop: `logo_height: 72` → `logo_height: 108`
   - Mobile: unchanged (`logo_height_mobile: 56`)
2. **Let the left logo bleed across the divider** into the bottom row, with its bottom edge flush against the bottom of `header__row--bottom`. Added inside the existing `{% stylesheet %}` in `sections/header.liquid`, gated to `min-width: 750px`:

```css
@media screen and (min-width: 750px) {
  /* let the left icon-mark bleed down through the divider into the menu row */
  .header__row--top:has(.header-logo--left) {
    overflow: visible;
  }
  .header__row--top .header__column--left:has(.header-logo--left) {
    align-items: flex-end;
    position: relative;
    z-index: 1;
  }
  .header-logo--left {
    align-self: flex-end;
    margin-block-end: calc(-1 * (var(--header-logo-image-height, 108px) - 72px));
  }
}
```

The negative `margin-block-end` equals the extra height we added (108 − 72 = 36px), so the logo's top stays where it was (visually fills the top row as before) and its bottom drops by 36px into/through the menu row to land flush with the header's bottom edge.

3. **No JS changes, no new assets, no schema changes.**

## Risks / open questions

- The 36px bleed assumes the menu row's effective height is ≈ 36px. If the menu row is taller, the logo's bottom will sit slightly above the menu's bottom rather than pixel-flush — visually close but not pixel-perfect. A stricter alternative would be `position: absolute` against `header-component { position: relative }` with `bottom: 0`, but that risks overlap with search/localization on narrow desktop viewports.
- `overflow: visible` on top row is the default — set explicitly only for defense.
- Sticky header and transparent-header variants: same selectors apply; no special handling needed.
- Mobile (< 750px): existing mobile grid moves the left logo into `grid-area: center`; the new CSS is scoped to desktop via `min-width: 750px`.

## Verification plan

- Visual inspection on local dev / PR preview (Lars).
- `npm run lint` / `npm run build` if present.
- `git diff` against previous commit.

## Files touched

- `sections/header.liquid` (Liquid line 47 + appended CSS in the in-file stylesheet)
