# Product Launch Plan — Paint Products

## Decision Log

### 1. Paint Types at Launch

All 6 paint types will be created:

| Prefix | Paint Type      | Color Variations | Status   |
|--------|-----------------|------------------|----------|
| 10     | Vægmaling       | All 32 colors    | Full     |
| 20     | Loftmaling      | 1 basic (Snehvid / DLM0101) | Sample |
| 30     | Træ & Metal     | 1 basic (Snehvid / DLM0101) | Sample |
| 40     | Strukturmaling  | 1 basic (Snehvid / DLM0101) | Sample |
| 50     | Træbeskyttelse  | 1 basic (Snehvid / DLM0101) | Sample |
| 60     | Gulvmaling      | 1 basic (Snehvid / DLM0101) | Sample |

**Reasoning:** Only Vægmaling is confirmed for full color range. The other 5 types are launched with a single sample product so the customer (website owner) can review and decide which colors to expand per type.

### 2. Tagging Strategy

Every paint product will carry structured tags so entire paint types can be enabled/disabled via script:

```
Tags per product:
- paint                          → identifies all paint products
- paint-type:{type}              → e.g. paint-type:vaegmaling, paint-type:loftmaling
- paint-type-prefix:{prefix}     → e.g. paint-type-prefix:10, paint-type-prefix:20
- color-family:{family}          → e.g. color-family:whites, color-family:blues
- color-code:{dlm_code}          → e.g. color-code:DLM0203
```

This allows scripts to:
- Disable all Loftmaling: filter by `paint-type:loftmaling` → set status to draft
- Disable all Blues across types: filter by `color-family:blues` → set status to draft
- Re-enable selectively at any time

### 3. Product Naming Convention

```
{Paint Type} — {Color Name}
```

Examples:
- "Vægmaling — Havbrise"
- "Vægmaling — Snehvid"
- "Loftmaling — Snehvid"
- "Træ & Metal — Snehvid"

### 4. Product Count at Launch

| Type           | Products |
|----------------|----------|
| Vægmaling      | 32       |
| Loftmaling     | 1        |
| Træ & Metal    | 1        |
| Strukturmaling | 1        |
| Træbeskyttelse | 1        |
| Gulvmaling     | 1        |
| **Total**      | **37**   |

---

## 5. Size Variants

All paint products use the same 3 size variants:

| Size | Applies to        |
|------|--------------------|
| 5L   | All paint products |
| 10L  | All paint products |
| 20L  | All paint products |

No other sizes needed. This is uniform across all 6 paint types.

---

## 6. Pricing

Pricing is **the same regardless of color** — only varies by size. Prices are placeholder and will be corrected later.

### Vægmaling (all 32 colors)

| Size | Price  |
|------|--------|
| 5L   | 299 kr |
| 10L  | 499 kr |
| 20L  | 899 kr |

### All other paint types (1 sample product each)

Each non-Vægmaling type gets its own placeholder pricing — different per type to reflect that final prices will vary between types.

| Paint Type      | 5L     | 10L    | 20L     |
|-----------------|--------|--------|---------|
| Loftmaling      | 279 kr | 469 kr | 849 kr  |
| Træ & Metal     | 329 kr | 549 kr | 979 kr  |
| Strukturmaling  | 349 kr | 579 kr | 1.029 kr|
| Træbeskyttelse  | 359 kr | 599 kr | 1.049 kr|
| Gulvmaling      | 369 kr | 619 kr | 1.099 kr|

> **Note:** All prices are temporary placeholders. Will be updated with real prices from customer.

---

## Open Questions (to answer before building)

- [x] **Sizes:** 5L, 10L, 20L — same for all paint types
- [x] **Pricing:** Same price regardless of color, varies by size + type. Placeholder prices set.
- [x] **Color availability:** Only Vægmaling gets all 32 colors at launch. Other types get 1 sample product each. Expansion TBD with customer.
- [x] **Product images:** Single shared image for all products: `images/products/test-product.png`. Will be replaced with real photos later.
- [x] **Sample color for non-Vægmaling:** Confirmed — Snehvid (DLM0101) for all 5 sample products

---

## Scripts

### Create all paint products

```bash
# Preview what will be created
node scripts/products/create-paint-products.js --dry-run

# Create all 37 products with images
node scripts/products/create-paint-products.js

# Create without uploading images
node scripts/products/create-paint-products.js --skip-images
```

### Enable/disable products by tag

```bash
# Disable all Loftmaling (set to draft)
node scripts/products/toggle-paint-type.js paint-type:loftmaling draft

# Re-enable all Loftmaling
node scripts/products/toggle-paint-type.js paint-type:loftmaling active

# Disable all blue colors across all types
node scripts/products/toggle-paint-type.js color-family:blues draft

# Disable ALL paint products at once
node scripts/products/toggle-paint-type.js paint draft

# Preview without making changes
node scripts/products/toggle-paint-type.js paint-type:gulvmaling draft --dry-run
```
