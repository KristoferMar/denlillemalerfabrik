# Logo i venstre hjørne skal være "større"

Airtable record: recl9a2robOUwMP3f (P1)

## Context

The header has two logos rendered by `sections/header.liquid` via the `header-logo-static` snippet:

- **Left** (line 47): `larsfray-single-logo.svg` with class `header-logo--left` — the icon-mark in the left corner. This is the one the todo is about.
- **Center** (line 51): `dlm-text-logo.svg` with class `header-logo--center` — the wordmark. **Out of scope.**

`snippets/header-logo-static.liquid` accepts optional `logo_height` / `logo_height_mobile` params and falls back to `settings.logo_height` (50) / `settings.logo_height_mobile` (40). Neither render site currently passes them, so today both logos use the 50/40 defaults.

The header row sizes around its tallest child (`.header__columns` has only `--padding-block-*: var(--header-padding)` ≈ `var(--padding-sm)` on each side, no fixed row height). `--header-height` itself is recomputed by `assets/header.js` at runtime from the rendered DOM, so the layout cascade (sticky offset, transparent-header offset for `index`/`product`/`collection`) updates automatically when the logo grows. No CSS height variables to touch.

## Approach

- In `sections/header.liquid` line 47, pass explicit `logo_height: 72, logo_height_mobile: 56` to the left logo render. **No changes to the center logo render** on line 51.
- 72px desktop / 56px mobile = +44% / +40% bump from the 50/40 default. With `--header-padding` ≈ `--padding-sm` (~12px) above and below, the row content area becomes ~96px / ~80px — large enough that the icon visually fills the row's top-to-bottom span (= "flugter med top og bund af header-menuen"), which is what the description asks for.
- The bump is hard-coded inline at the render site rather than introduced as a new theme setting. This matches the existing pattern (the snippet already supports per-call overrides) and avoids cluttering the customizer for a one-off tweak. If the merchant wants this tunable from the customizer later, that's a separate todo.

## Files likely to change

- `sections/header.liquid` — line 47, one render call: add `logo_height: 72, logo_height_mobile: 56`. Verified line exists and matches the snippet's API.

(Out of scope: the center wordmark logo, the `_header-logo` block, `settings.logo_height` defaults — those affect other rendering paths and we don't want to move them.)

## Risks / open questions

- **Pure-visual change, no measurements taken.** I can't preview the storefront from here, so 72/56 is an informed guess based on the row's default `--header-padding` (~12px). If after deploy it's still too small or now too big, the fix is to tweak the two numbers — no other code changes needed.
- **Header gets taller everywhere it's not transparent.** Plain pages (cart, blog, product list…) will gain ~36px of header height on desktop. Sticky pages will too. This is the intended consequence — the user explicitly wants a bigger header — but worth noting in case a downstream section relied on the previous height visually.
- **Transparent header pages.** `index`, `product`, `collection` use `--header-height` to offset the first section under the header. Because `header.js` re-publishes `--header-height` from the rendered DOM, the offset auto-adjusts. No action needed, but worth a spot-check on the homepage after deploy.
- **Center logo unchanged.** The wordmark in the middle stays at 50/40. If the user wants both logos to scale together for visual balance, we'd add a second override to line 51 — flag if so.
- **Single setting vs two.** Could be turned into a theme setting (`settings.logo_height_left` / `_mobile`) so the merchant tweaks it from the customizer. Going with inline numbers per the customer's single-developer / no-customizer-bloat preference. Flag if you'd rather have the setting.

approve plan?
