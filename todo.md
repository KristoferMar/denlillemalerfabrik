# Go-live Todo — P0 focus

What needs to happen before launch. P1 and P2 items parked — revisit after we're live.

Related reference: [`docs/products/catalog-overview.md`](docs/products/catalog-overview.md) for the current product structure.

---

## Top priorities (storefront experience)

### 1. Product descriptions

All paint + sortiment products need real descriptions. Today most are empty or placeholder.

- [ ] **Paint line (21 products)** — 15 glans products + 6 Specialblanding. Each description should cover:
  - What it is, where to use it
  - Coverage (m²/L)
  - Drying time
  - Application tools (pensel / rulle / sprøjte)
  - Number of coats
  - Finish (glans level context)
  Approach: LLM-draft from a structured template, then hand-edit with the customer's voice.
- [ ] **Sortiment (~40 products)** — each one covers a specific kategori (spartel, væg/loft, vægbeklædning, træbeskyttelse, mur/facade/tag, rens, epoxy). Focus on *what it's for* and *how to use it*.
- [ ] **Lars Frey tilbehør (108 products)** — decide scope: full descriptions, or lean on vendor-supplied product data where available.
- [ ] **Coverage metafield** — `custom.coverage_m2_per_litre` per paint product. Needed by the Malerberegner and by customer expectations.

### 2. Colors — structure properly

Colors exist today as metaobjects + `docs/colors.md` reference, but the picker and taxonomy feel scattered.

- [ ] **Audit every color-picker instance** — landing page, PDP, farver page, category pages. List which are shared vs separate state.
- [ ] **Single shared color component** — reads 32 colors from one source (metaobjects or JSON config).
- [ ] **Validate hex values** against `docs/colors.md` — no drift between picker and swatches.
- [ ] **Color family filter** on farver page — 8 families, expandable group.
- [ ] **Flat color swatches** — 32 × 2K PNGs. Scriptable from `docs/colors.md` in one pass.
- [ ] **Deep-link behavior** — picking a color on farver page pre-selects that variant on the PDP.
- [ ] **Farver page design** — make it feel like a real color library, not just a grid.

### 3. Product page cleanup

Strip noise, tighten the layout, make the PDP feel deliberate.

- [ ] **Template audit** — review [sections/product-information.liquid](sections/product-information.liquid) + blocks. Remove anything that doesn't add value on a paint PDP.
- [ ] **Variant selector UX** — 32 colors × multiple sizes is a lot. Mobile-first review.
- [ ] **Price + stock clarity** — state clearly (paint always in stock; sortiment real qty).
- [ ] **Image gallery** — size-variant swaps work cleanly, images are sharp, rounded corners consistent.
- [ ] **Specialblanding ordering flow** — clear way to specify the target color (NCS code, free text, photo upload).

### 4. Related products

PDP bottom section — "customers also bought" / "same paint-type" / "complete the kit".

- [ ] **Decide relationship logic** — options:
  - Same paint-type, different glans (Vægmaling 5 → Vægmaling 10)
  - Same kategori for sortiment
  - Hand-picked via metafield
  - Shopify's default algorithm (last resort — weak signal for paint)
- [ ] **Visual design** — cards match the rest of the storefront, not default theme leftovers.
- [ ] **Mobile** — swipeable carousel or tidy grid; no overflow.
- [ ] **Complementary products section** — for paint products, suggest brushes/tape/spartel from sortiment/Lars Frey.

### 5. Visual polish — product pages

Overall design that makes the PDP feel premium and on-brand.

- [ ] **Typography pass** — consistent headings, readable line lengths.
- [ ] **Spacing + rhythm** — room between sections, no cramped UI.
- [ ] **Trust signals** — Dansk produceret, low-VOC, returpolitik, leveringstid.
- [ ] **Specialblanding CTA** — prominent + clear if customer wants a custom mix.
- [ ] **Cross-browser + real-device review** — Safari iOS especially.

---

## Other P0 blockers (non-negotiable for launch)

Not part of the "top 5" focus but cannot ship without them.

### Payments

- [ ] Shopify Payments enabled (or Stripe fallback), DKK base currency
- [ ] MobilePay — expected by Danish consumers
- [ ] Klarna / Viabill — "køb nu, betal senere"
- [ ] End-to-end test each payment method

### Shipping

- [ ] Carrier integration (PostNord, GLS, or both)
- [ ] Hazardous-goods compliance — paint is classified hazardous for shipping
- [ ] Free shipping threshold (e.g. "fri fragt over 500 kr")
- [ ] Delivery-time estimate at checkout
- [ ] Returns / click-and-collect policy

### Legal pages (EU/DK required)

- [ ] Handelsbetingelser (T&C)
- [ ] Privatlivspolitik (GDPR-compliant)
- [ ] Cookiepolitik + consent banner
- [ ] Fortrydelsesret / returpolitik
- [ ] Leveringsbetingelser
- [ ] Om os / kontakt — CVR, address, email, phone

### Data the customer owes

- [ ] **Safety Data Sheets (SDS)** — legally required in EU, downloadable from product page
- [ ] **Technical Data Sheets (TDS)** — PDF per product
- [ ] **Real prices** for 12 zero-priced products (see sortiment.xlsx — most rows still empty)

### Missing paint imagery

- [ ] **6 Specialblanding hero images** — generate via [bucket-preview.html](scripts/images/bucket-preview.html), upload via [upload-paint-bucket-images.js](scripts/products/upload-paint-bucket-images.js)

---

## Done (recent history, for reference)

### Data + product integrity

- [x] Product export refreshed
- [x] Strukturmaling consolidation verified (1 product, no duplicate handles)
- [x] Vægmaling Glans 10 — shape confirmed (32 × 3L/10L), SKUs fixed (`-5L` → `-3L`)
- [x] Real prices populate — pending customer data (zero-priced products flagged)
- [x] Inventory model — paint `tracked: false`, sortiment + Lars Frey set to qty 10 (replenish-on-sale)
- [x] Paint-type × glans producibility confirmed with customer
- [x] Legacy products retired — 4 legacy products + Loftmaling Glans 2 (not in sortiment.xlsx)
- [x] URL redirects for all 6 removed product handles
- [x] `productType` populated on 170 products (Vægmaling, Loftmaling, …, Tilbehør)

### Product imagery — paint line

- [x] Generation approach — Nano Banana for launch
- [x] Visual language — customer-defined
- [x] 15 hero images baked + uploaded
- [x] 26 size-variant images generated → 832 variants linked
- [x] CSS text overlay removed (now baked into images)

---

## Parked for post-launch

*Items moved out of P0. Revisit once we're live and stable.*

- SEO / Google Merchant / sitemap / schema.org
- Analytics + marketing pixels (GA4, Meta, consent mode v2)
- Collections / category pages / filters
- Reviews integration (Trustpilot or native)
- FAQ page, brand story, comparison guides
- Page speed / Core Web Vitals / accessibility deep-dive
- Metaobject / metafield cleanup
- Audit pass with `scripts/products/audit-color-products.js`
- Bundles, sample orders, color-matching tool
- Editorial / content calendar
- Textured / per-glans color swatches
- Room renders + lifestyle photography
- Individual color landing pages (`/colors/havbrise`)

---

## Things that matter but are easy to forget

- **Paint = hazardous goods** for shipping. Biggest operational gotcha.
- **SDS are legally required** in EU — no launch without them.
- **Cookie consent** — not optional in DK/EU.
- **MobilePay + Klarna** are effectively required for Danish consumer e-commerce.
- **Coverage data** feeds the Malerberegner — without it the calculator can't function.
- **VAT display** — confirm inkl./ekskl. moms (consumer sites almost always inkl.).
