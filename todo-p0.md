# P0 — Launch blockers

The critical tasks that must be done before we can ship. Nothing parked, nothing exploratory, no nice-to-haves.

Reference: [`todo.md`](todo.md) for the full list (P1/P2 parked items, done history, etc).

---

## 1. Product descriptions

All paint + sortiment products need real descriptions.

- [x] **Paint line (21 products)** — 15 glans products + 6 Specialblanding. Cover: what it is / where to use, coverage (m²/L), drying time, tools, number of coats, finish.
- [x] **Sortiment (~40 products)** — each covers a specific kategori (spartel, væg/loft, vægbeklædning, træbeskyttelse, mur/facade/tag, rens, epoxy). Focus on *what it's for* and *how to use it*.
- [x] **Lars Frey tilbehør — all 108 products have descriptions** (102 existing + 6 filled in this session: Skumvalse, Gaffatape Premium, Sandpapir D421 50 m / 5 m, Sandpapir D125 5 m, Sandpapir D126 2 m).
- [x] **Coverage metafield** — `custom.coverage_m2_per_litre` set on all 20 live paint products (14 glans + 6 Specialblanding). Conservative lower-bound values from malerbeskrivelser.md. Definition created in Shopify admin under `custom` namespace. Malerberegner can now do `m² × coats / coverage`.

## 2. Colors — structure properly

- [ ] **Audit every color-picker instance** — landing, PDP, farver page, category pages. Shared vs separate state.
- [ ] **Single shared color component** — reads 32 colors from one source (metaobjects or JSON config).
- [ ] **Validate hex values** against `docs/colors.md`.
- [ ] **Color family filter** on farver page — 8 families, expandable group.
- [ ] **Flat color swatches** — 32 × 2K PNGs. Scriptable from `docs/colors.md`.
- [ ] **Deep-link behavior** — picking a color on farver page pre-selects that variant on the PDP.
- [ ] **Farver page design** — make it feel like a real color library, not just a grid.

## 3. Product page cleanup

- [ ] **Template audit** — review [sections/product-information.liquid](sections/product-information.liquid) + blocks. Remove anything that doesn't add value on a paint PDP.
- [ ] **Variant selector UX** — 32 colors × multiple sizes is a lot. Mobile-first review.
- [ ] **Price + stock clarity** — paint always in stock; sortiment real qty.
- [ ] **Image gallery** — size-variant swaps work cleanly, images sharp, rounded corners consistent.
- [ ] **Specialblanding ordering flow** — clear way to specify target color (NCS code, free text, photo upload).

## 4. Related products

- [ ] **Decide relationship logic** — same paint-type different glans / same kategori / hand-picked metafield / Shopify default.
- [ ] **Visual design** — cards match the rest of the storefront.
- [ ] **Mobile** — swipeable carousel or tidy grid.
- [ ] **Complementary products section** — for paint products, suggest brushes/tape/spartel from sortiment/Lars Frey.

## 5. Visual polish — product pages

- [ ] **Typography pass** — consistent headings, readable line lengths.
- [ ] **Spacing + rhythm** — room between sections, no cramped UI.
- [ ] **Trust signals** — Dansk produceret, low-VOC, returpolitik, leveringstid.
- [ ] **Specialblanding CTA** — prominent + clear.
- [ ] **Cross-browser + real-device review** — Safari iOS especially.

## 6. Header / brand mark

- [ ] **Correct the corner logo** so it looks better (sizing, alignment, rendering).

## 7. Farver (color) component

- [x] **Fix the farver component** — end-to-end: homepage product-finder + /pages/colors color-explorer both resolve "Farve + Overflade" to a single variant and link to `/products/<handle>?variant=<id>` for native pre-selection on the PDP.

## 8. Malerberegner (paint calculator)

- [x] **Fix the UI** of the Malerberegner. (Theme typography, sub-group structure, loading state, per-item remove, cart-drawer sync.)
- [x] **Re-wire the Malerberegner** to the new product catalog (25 of 27 broken/TODO handles mapped to real products; 2 slots — Tapetklister + Metalprimer — parked pending customer decision). Audit script available at [scripts/products/audit-beregner-handles.js](scripts/products/audit-beregner-handles.js).

---

## Payments

- [ ] Shopify Payments enabled (or Stripe fallback), DKK base currency
- [ ] MobilePay — expected by Danish consumers
- [ ] Klarna / Viabill — "køb nu, betal senere"
- [ ] End-to-end test each payment method

## Shipping

- [ ] Carrier integration (PostNord, GLS, or both)
- [ ] **Hazardous-goods compliance** — paint is classified hazardous for shipping
- [ ] Free shipping threshold (e.g. "fri fragt over 500 kr")
- [ ] Delivery-time estimate at checkout
- [ ] Returns / click-and-collect policy

## Legal pages (EU/DK required)

- [ ] Handelsbetingelser (T&C)
- [ ] Privatlivspolitik (GDPR-compliant)
- [ ] Cookiepolitik + consent banner
- [ ] Fortrydelsesret / returpolitik
- [ ] Leveringsbetingelser
- [ ] Om os / kontakt — CVR, address, email, phone

## Data the customer owes

- [ ] **Safety Data Sheets (SDS)** — legally required in EU, downloadable from product page
- [ ] **Technical Data Sheets (TDS)** — PDF per product
- [ ] **Real prices** for 12 zero-priced products (see sortiment.xlsx)

## Missing paint imagery

- [ ] **6 Specialblanding hero images** — generate via [bucket-preview.html](scripts/images/bucket-preview.html), upload via [upload-paint-bucket-images.js](scripts/products/upload-paint-bucket-images.js)

---

## Non-negotiable reminders

- Paint = **hazardous goods** for shipping (biggest operational gotcha)
- **SDS legally required** in EU — no launch without them
- **Cookie consent** — not optional in DK/EU
- **MobilePay + Klarna** are effectively required for Danish consumer e-commerce
- **Coverage data** feeds the Malerberegner — without it, calculator can't function
- **VAT display** — confirm inkl./ekskl. moms (consumer sites almost always inkl.)
