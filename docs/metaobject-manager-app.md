# Metaobject Manager — Shopify Custom App

## Overview

"Metaobject Manager" is the custom Shopify app used by Den Lille Malerfabrik to manage products, metaobjects, files, and inventory via the Admin API. It was created through the Shopify Partners dashboard and authenticates using OAuth.

---

## Authentication

The app uses the **Authorization Code Grant** OAuth flow, handled by `scripts/auth.js`.

```bash
node scripts/auth.js <store-name>          # authenticate a store
node scripts/auth.js --list                # show stored tokens
node scripts/auth.js --revoke <store-name> # remove a token
```

- Tokens are stored in `scripts/.tokens.json` (git-ignored)
- App credentials (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`) live in `scripts/.env`
- Callback URL: `http://localhost:3456/callback` (must be registered in Partners dashboard)

---

## API Scopes

The app requires the following access scopes. These must be configured in the Shopify Partners dashboard under the app's settings.

| Scope | Purpose |
|-------|---------|
| `read_files`, `write_files` | Upload product images |
| `read_inventory`, `write_inventory` | Set and read stock levels |
| `read_metaobject_definitions`, `write_metaobject_definitions` | Manage metaobject schemas (color definitions, etc.) |
| `read_metaobjects`, `write_metaobjects` | CRUD operations on metaobject entries |
| `read_product_feeds`, `write_product_feeds` | Product feed management |
| `read_product_listings`, `write_product_listings` | Product listing management |
| `read_products`, `write_products` | Create/update products and variants |
| `read_publications`, `write_publications` | Publish products to sales channels |
| `customer_read_metaobjects` | Storefront metaobject access |
| `unauthenticated_read_metaobjects` | Public/unauthenticated metaobject reads |

**Full scope string** (for Partners dashboard):

```
read_files,write_files,read_inventory,write_inventory,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,read_product_feeds,write_product_feeds,read_product_listings,write_product_listings,read_products,write_products,read_publications,write_publications,customer_read_metaobjects,unauthenticated_read_metaobjects
```

> **Note:** The `SCOPES` constant in `scripts/auth.js` is used during the OAuth flow. If you add new scopes in the Partners dashboard, you must also re-authenticate (`node auth.js <store>`) to get a token with the updated permissions.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `scripts/.env` | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STORE` |
| `scripts/.tokens.json` | Stored OAuth tokens per store (git-ignored) |

---

## Related Scripts

| Script | Description |
|--------|-------------|
| `scripts/auth.js` | OAuth authentication flow |
| `scripts/shopify-client.js` | Shared GraphQL client used by all scripts |
| `scripts/products/create-paint-products.js` | Create all paint products with variants |
| `scripts/products/set-inventory.js` | Set inventory levels for all paint products |
| `scripts/products/toggle-paint-type.js` | Toggle paint type product status |
