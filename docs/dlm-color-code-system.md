# DLM Color Code System

## Overview

Every paint color in the DLM catalog has a unique code that identifies the color family and shade. The code is shared across all paint types — the same "White 01" color can be used for Vægmaling, Træ & Metal, Loftmaling, etc.

The full professional code is built by combining the **paint type prefix** with the **color code**.

---

## Code Format

### Color code (stored on the metaobject)

```
DLM[FF][SS]
```

- `DLM` — brand prefix
- `FF` — color family (2 digits, 01–99)
- `SS` — shade within the family (2 digits, 01–99)

Example: **DLM0204** = Sky, shade 04

### Full professional code (built dynamically)

```
DLM[TT]-[FF][SS]
```

- `TT` — paint type prefix (2 digits)
- `FF` — color family (2 digits)
- `SS` — shade (2 digits)

Example: **DLM30-0204** = Træ & Metal, Sky, shade 04

The full code is not stored — it is composed from the product's paint type + the color's DLM code.

---

## Paint Type Prefixes

| Prefix | Paint Type |
|---|---|
| 10 | Vægmaling |
| 20 | Loftmaling |
| 30 | Træ & Metal |
| 40 | Strukturmaling |
| 50 | Træbeskyttelse |
| 60 | Gulvmaling |

---

## Color Families

| Code | Family |
|---|---|
| 01 | White |
| 02 | Sky |
| 03 | Grey |
| 04 | Mist |
| 05 | Beige |
| 06 | Sand |
| 07 | Dawn |
| 08 | Clay |

New families are added by incrementing the family code (09, 10, 11...).

---

## Shade Numbering

Shades within a family are numbered 01–99, ordered from lightest to darkest.

---

## Where Codes Are Used

| Context | Code shown | Example |
|---|---|---|
| Storefront (product page, filters) | Color code only | DLM0204 |
| Professional datasheets / labels | Full code with type | DLM30-0204 |
| Metaobject (`dlm_code` field) | Color code only | DLM0204 |
| Search (storefront + admin) | Both formats work | DLM0204 or DLM30-0204 |

---

## Metaobject Structure: `paint_color`

| Field | Key | Type | Example |
|---|---|---|---|
| Name | `name` | single_line_text_field | White 01 |
| DLM Code | `dlm_code` | single_line_text_field | DLM0101 |

Colors are shared across paint types. A single "White 01" (DLM0101) entry is referenced by Vægmaling products, Loftmaling products, Træ & Metal products, etc.

---

## Metaobject Structure: `paint_type`

| Field | Key | Type | Example |
|---|---|---|---|
| Name | `name` | single_line_text_field | Vægmaling |
| Type Prefix | `type_prefix` | single_line_text_field | 10 |

The `type_prefix` field allows the storefront to build the full professional code dynamically:

```
DLM + type_prefix + "-" + color_code_digits
```

---

## Full Code Examples

| Product | Paint Type | Color | Display Code | Full Pro Code |
|---|---|---|---|---|
| Interiør Glans 5 | Vægmaling (10) | White 01 | DLM0101 | DLM10-0101 |
| Interiør glans 10 blå | Vægmaling (10) | Sky 04 | DLM0204 | DLM10-0204 |
| Loft glans 25 | Loftmaling (20) | Grey 01 | DLM0301 | DLM20-0301 |
| Træ Glans 40 | Træ & Metal (30) | Beige 02 | DLM0502 | DLM30-0502 |

---

## Adding New Colors

1. Choose the color family (or create a new one with the next available code)
2. Choose the next available shade number within that family
3. Add the entry via the `create-metaobject-colors-for-store.js` script or manually in the Shopify admin

## Adding New Paint Types

1. Assign the next available type prefix (70, 80, etc.)
2. Add the `type_prefix` field to the paint_type metaobject entry
3. The full professional code will automatically work for all existing colors
