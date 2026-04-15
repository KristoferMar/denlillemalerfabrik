# Claude Code Prompt — Den lille malerfabrik Malerberegner Redesign

## Context

You are redesigning the "Malerberegner" (paint calculator) step-flow for the Danish artisan paint brand **Den lille malerfabrik**. The existing Shopify theme has a flat, lifeless UI. The goal is a clean, modern, artisan-premium aesthetic that feels like a craft paint atelier — not a generic webshop form.

This is a **Shopify theme customization task**. The output should be a Liquid section file (or a standalone HTML/CSS/JS component, depending on what already exists). Ask me for the current theme structure if you need it.

---

## Design System

### Fonts
- **Display / headings**: `Cormorant Garamond` (Google Fonts) — weights 400, 500, 600 italic
- **Body / UI**: `DM Sans` (Google Fonts) — weights 300, 400, 500
- Load both via `<link>` in the `<head>` or via Shopify's `theme.liquid`

### Color Palette (CSS custom properties)
```css
:root {
  --cream: #F9F6F0;
  --warm-white: #FDFBF8;
  --forest: #1C1917;           /* warm black — CTA, selected state */
  --forest-light: #2E2B28;     /* hover on black */
  --forest-faint: #F0EAE2;     /* selected card bg tint — warm beige */
  --gold: #B5422E;             /* terracotta — eyebrows, accents */
  --gold-light: #EDE8E0;       /* help strip background */
  --charcoal: #1C1917;
  --mid: #8A8078;              /* warmer gray to match the beige palette */
  --border: #DDD8CF;
  --border-soft: #EAE6DF;
}
```

### Spacing
- Page max-width: `960px`, centered, padding `56px 24px 120px`
- Card grid gap: `10px`
- Section margin-top: `40px`
- Component internal padding: cards `18px 16px 16px`

---

## Component Specifications

### 1. Navigation Bar
- Height: `64px`, background `var(--warm-white)`, bottom border `1px solid var(--border)`
- Logo: 2×2 color grid mark (forest / gold / terracotta #C25B3A / steel blue #4A7FA8) + wordmark in DM Sans uppercase
- Nav links: 14px, weight 400, color `var(--mid)`, hover → `var(--charcoal)`
- Cart button: `var(--forest)` background, white text, 13px, rounded 6px, cart icon left

### 2. Page Header
- Eyebrow: `11px`, `0.12em` letter-spacing, uppercase, weight 500, color `var(--gold)`, margin-bottom `12px`
- H1: Cormorant Garamond, `52px`, weight 500, `var(--charcoal)`, letter-spacing `-0.01em`, line-height `1.05`
- Subtitle: DM Sans 15px, weight 300, color `var(--mid)`, line-height `1.65`, max-width `480px`

### 3. Step Indicator
Three steps in a horizontal flex row. A `1px solid var(--border)` line runs behind them at vertical center (via `::before` pseudo-element at `top: 20px`).

Each step:
- Circle: `40px` diameter, `1.5px` border
- Label: `11px`, `0.08em` letter-spacing, uppercase, weight 500

States:
| State | Circle background | Border | Text color | Extra |
|---|---|---|---|---|
| Inactive | `var(--cream)` | `var(--border)` | `var(--mid)` | — |
| Active | `var(--forest)` | `var(--forest)` | white | `box-shadow: 0 0 0 5px rgba(44,74,62,0.12)` |
| Done | `var(--forest-faint)` | `var(--forest-light)` | `var(--forest)` | — |

### 4. Section Labels (Indvendigt / Udvendigt)
Flex row with three elements:
1. `<h2>` — Cormorant Garamond, `22px`, weight 500, **italic**, `var(--charcoal)`
2. Flex-grow divider line — `1px solid var(--border)`
3. Count badge — `10px`, uppercase, `0.1em` spacing, color `var(--mid)`, border `1px solid var(--border)`, border-radius `20px`, padding `3px 10px`

### 5. Treatment Cards

Layout: CSS Grid, `repeat(4, 1fr)`, gap `10px`

**Resting state:**
- Background: `var(--warm-white)`
- Border: `1.5px solid var(--border-soft)`
- Border-radius: `10px`
- Padding: `18px 16px 16px`
- Flex column, align-items flex-start, gap `12px`

**Icon container** (inside each card):
- `36px × 36px`, border-radius `8px`
- Background: `var(--cream)`, border `1px solid var(--border)`
- SVG icon: `18px`, stroke `var(--forest)`, stroke-width `1.5`, no fill, stroke-linecap/join round

**Card label:**
- DM Sans 13px, weight 400, `var(--charcoal)`, line-height `1.4`

**Bottom accent bar** (via `::before` pseudo-element):
- `3px` height, background `var(--forest)`, positioned at card bottom
- `transform: scaleX(0)` at rest, `transform-origin: left`

**Hover state** (transition: `all 0.2s ease`):
- Border: `var(--forest)`
- Background: `var(--forest-faint)`
- Transform: `translateY(-2px)`
- Box-shadow: `0 8px 24px rgba(44,74,62,0.10)`
- `::before` bar: `scaleX(1)`
- Icon container: background `var(--forest)`, border `var(--forest)`
- Icon SVG stroke: `white`

**Selected state** (same as hover but static, controlled via JS class toggle):
- All hover styles apply
- Only one card can be selected at a time

**JS behavior:**
```js
function selectCard(card) {
  document.querySelectorAll('.treatment-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  const label = card.querySelector('.card-text').textContent.trim();
  document.querySelector('.cta-hint').textContent = label + ' valgt';
}
```

### 6. Help Strip
Below the last card grid. Background `var(--gold-light)`, border `1.5px solid #E8D5B0`, border-radius `12px`, padding `24px 28px`. Flex row, space-between.

- Left: H3 (Cormorant Garamond, 20px, 500) + `<p>` (13px, weight 300, `var(--mid)`)
- Right: button with background `var(--charcoal)`, white text, 13px, border-radius `8px`, hover → `var(--forest)`

### 7. Fixed CTA Bar
`position: fixed`, bottom 0, full width. Background `var(--warm-white)`, top border `1px solid var(--border)`, padding `16px 48px`. Flex, align-items center, justify-content flex-end, gap `12px`.

- Hint text: 13px, weight 300, `var(--mid)` — updates dynamically with selected card name + " valgt"
- Next button: background `var(--forest)`, white, 14px, weight 500, border-radius `8px`, padding `12px 28px`, flex with right-arrow SVG icon. Hover → `var(--forest-light)` + `translateY(-1px)`

---

## Content — Treatment Options

### Indvendigt (9 cards)
1. Ny gips – væg
2. Tidligere malet gips – væg
3. Nyt gipsloft
4. Tidligere malet loft
5. Væv / filt – gips/beton
6. Beton / mur – indvendigt
7. Træ – indvendigt
8. Køkkenlåger & inventar
9. Metal – indvendigt

### Udvendigt (5 cards)
1. Facade – ny/afrenset
2. Facade – tidligere malet
3. Udvendigt træ
4. Betongulv – bolig
5. Betongulv – industri / værksted

---

## SVG Icons (one per treatment)

Use simple, geometric line icons (`stroke`, no fill, `stroke-width: 1.5`, `stroke-linecap: round`, `stroke-linejoin: round`). Suggested paths — feel free to improve:

- Ny gips (grid of 4 squares), Tidligere malet gips (single panel with edge line), Gipsloft (triangle roofline above baseline), Malet loft (three horizontal lines), Væv/filt (double-arrow stacked), Beton/mur (stacked rectangles), Træ (vertical panel), Køkkenlåger (cabinet with horizontal bar), Metal (quad circle grid), Facade ny (house outline), Facade malet (house with door cut), Udvendigt træ (three vertical planks), Betongulv bolig (horizontal slab stack), Betongulv industri (grid of 4)

---

## Shopify Integration Notes

- Wrap all CSS in `{% style %}` blocks or a dedicated `.css` asset file loaded via `{{ 'calculator.css' | asset_url | stylesheet_tag }}`
- If this is a Liquid section, expose the treatment list as `schema` settings so content editors can add/remove treatments from the Shopify Customizer without touching code
- Google Fonts: add to `theme.liquid` `<head>` if not already present
- The fixed CTA bar z-index should be `100` to clear Shopify's own UI elements
- Add `padding-bottom: 80px` to `body` or the page wrapper to avoid the fixed bar covering content

---

## Deliverables

1. `malerberegner.liquid` — the full Liquid section (or component file)
2. `calculator.css` — extracted styles as a theme asset
3. Any JS as `calculator.js` — theme asset, loaded via `{{ 'calculator.js' | asset_url | script_tag }}`
4. Schema block at the bottom of the `.liquid` file so treatments are editable in the Customizer

Start by asking me to share the current section file or theme structure if you need to understand what already exists before generating new code.