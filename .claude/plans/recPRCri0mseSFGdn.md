# recPRCri0mseSFGdn — "Header banner" oppe øverst på siden med roterende update-tekster

## Todo (verbatim)

**Title:** Vi skal have lavet "header banner" oppe øverst på siden hvor vi viser noget tekst som løbende skifter hvor vi giver updates.

**Description:** Updates skal være fx "hurtig betaling med Mobile pay", "Produceret i danmark", og så må du gerne finde på nogle flere efter det.

## Classification

**Code-only.** The Shopify theme already ships with all the runtime pieces; nothing in the Shopify catalog needs to change. The implementation is purely a `sections/header-group.json` update.

## Current state

The theme already has the complete announcement-bar feature built — it just isn't wired into the header group.

- `sections/header-announcements.liquid` — fully-built section. It renders an `<announcement-bar-component>` slider that, when `section.blocks.size > 1`, lazy-loads `assets/announcement-bar.js` (the autoplay logic) and shows nav arrows. Section settings: `speed` (2–10 s, default 5), `section_width` (page / full), `color_scheme` (default `scheme-4`), `divider_width`, top/bottom padding. `enabled_on.groups: ["header"]`, so it is available to add to the header group.
- `blocks/_announcement.liquid` — per-slide block. Each block exposes an `inline_richtext` `text`, optional `link` URL, plus typography (font, size, weight, letter spacing, case). The preset uses `var(--font-subheading--family)` / `0.75rem`.
- `assets/announcement-bar.js` — present (loaded automatically when there are >1 blocks).
- `sections/header-group.json` — currently contains only `header_section` with `header-logo` and `header-menu` static blocks. **No announcement section is wired in.** That is why nothing currently renders above the header.

Repo: branch `v2`, clean (one untracked `.claude/settings.local.json`, ignored for this todo). Last commit `004fd7d`.

## Proposed changes

1. **`sections/header-group.json`** — add a new section entry `announcement_bar_section` of type `header-announcements`, then put it FIRST in `order` so it renders above the existing header row.

   Section settings (keep defaults except where called out):
   - `speed: 4` — 4 s per slide.
   - `section_width: "full-width"` — banners across the full viewport feel native.
   - `color_scheme: "scheme-1"` — DLM's primary scheme to align with the rest of the header. (Easily flipped in the editor.)
   - `divider_width: 1` — 1 px hairline so the banner reads as its own row.
   - `padding-block-start / padding-block-end: 8` — slimmer than the 15 px default.

2. **Six rotating messages** as `_announcement` blocks. Danish, sentence case, no terminal punctuation, no link:
   1. `Hurtig betaling med MobilePay` *(from description)*
   2. `Produceret i Danmark` *(from description)*
   3. `Fri fragt over 499 kr.`
   4. `Tilfredshedsgaranti — 30 dages fortrydelsesret`
   5. `Personlig farverådgivning — skriv til os`
   6. `Hurtig levering 1–3 hverdage`

3. **No JS or CSS changes.** The bundled `announcement-bar.js` + the section's inline stylesheet are sufficient.

4. **No locales changes.** All strings live inline in `header-group.json`.

## Risks / open questions

- `sections/header-group.json` has a comment warning it is "auto-generated" and may be overwritten by the theme editor. In single-dev / no-deploy / no-auto-pull mode this is fine — once committed, the next theme push will include the change. The shop-editor risk is just that an admin save will write the file back; same trade-off as any theme-editor-managed config.
- Sticky header (`enable_sticky_header: "always"`) — announcement bar will stick with the header. That is expected.
- Transparent-header flags are all false, so no color-scheme conflict.
- `color_scheme: "scheme-1"` is a best guess for DLM's brand. If they prefer dark/inverse, easy editor flip.
- The Fri fragt threshold (`499 kr.`) is an assumption. If DLM has a different threshold (or no free-shipping policy), swap or drop that block in the editor.
- Six messages is on the long side. Customer can prune blocks in the editor; staying above 2 keeps autoplay on.

## Files to change

- `sections/header-group.json` — additive edit only.

## Verification

- `git diff sections/header-group.json`.
- Run `npm run lint` and `npm run build` if defined; report exit statuses.
- Visual verification deferred to Kristofer after push.

## Commit / push

- Commit on branch `v2`. No new branch. Subject = tightened todo title. Trailer: `Refs todo: recPRCri0mseSFGdn`.
- **Do NOT push or deploy.** Remind Kristofer afterwards.
