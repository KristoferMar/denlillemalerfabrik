# DLM Data Tools — Setup Guide

## Prerequisites

- Node.js 18+ installed
- Access to the Shopify Partners dashboard at **partners.shopify.com**

## Step 1 — Create a Custom App in the Partners Dashboard

1. Go to **partners.shopify.com** → **Apps** → **Create app** → **Create app manually**
2. Give it a name (e.g. "Metaobject Manager")
3. Under **App setup**, set:
   - **App URL**: `http://localhost:3456`
   - **Allowed redirection URL(s)**: `http://localhost:3456/callback`
4. Save
5. Copy the **Client ID** and **Client secret** from the **Client credentials** section

## Step 2 — Configure API scopes

In the app's configuration, enable these access scopes:

- `read_metaobject_definitions`
- `write_metaobject_definitions`
- `read_metaobjects`
- `write_metaobjects`
- `read_products`
- `write_products`

## Step 3 — Install the app on the store

1. In the Partners dashboard, go to your app → **Test your app** (or **Select store**)
2. Choose the target development store (e.g. `den-lille-malerfabrik`)
3. This creates the relationship between the app and the store

## Step 4 — Create the .env file

```bash
cd scripts
```

Create a `.env` file with your credentials from step 1:

```
SHOPIFY_CLIENT_ID=your_client_id_here
SHOPIFY_CLIENT_SECRET=your_client_secret_here
SHOPIFY_STORE=den-lille-malerfabrik.myshopify.com
```

> **Never commit `.env` or `.tokens.json` to git.** They contain secrets.

## Step 5 — Authenticate against the store

```bash
node auth.js den-lille-malerfabrik
```

This will:
1. Start a local server on port 3456
2. Open your browser to the Shopify authorization page
3. You approve the permissions
4. The script exchanges the code for a permanent access token
5. The token is saved in `.tokens.json`

You only need to do this once per store.

## Step 6 — Verify the connection

```bash
node list-metaobjects.js
```

This should list all metaobject definitions in the store. No npm install needed — the scripts use zero external dependencies.

## Available scripts

| Command | Description |
|---|---|
| `node auth.js <store>` | Authenticate against a store (one-time) |
| `node auth.js --list` | Show all stored tokens |
| `node auth.js --revoke <store>` | Remove a stored token |
| `node list-metaobjects.js` | List all metaobject definitions |
| `node list-metaobjects.js <type>` | List all entries of a specific type |
| `node bulk-create-colors.js --dry-run` | Preview color creation (no changes) |
| `node bulk-create-colors.js` | Bulk-create paint colors |
| `node bulk-create-platforms.js --dry-run` | Preview platform creation (no changes) |
| `node bulk-create-platforms.js` | Bulk-create color platforms |
| `node delete-metaobjects.js <type>` | Preview deletion (dry run) |
| `node delete-metaobjects.js <type> --confirm` | Delete all entries of a type |

## Multi-store usage

All scripts support a `--store` flag to target a different store:

```bash
node auth.js another-client
node list-metaobjects.js --store another-client
node bulk-create-colors.js --store another-client --dry-run
```

Without `--store`, scripts use the `SHOPIFY_STORE` value from `.env`.

## Backwards compatibility

If you have an existing `SHOPIFY_ACCESS_TOKEN` in `.env` (e.g. a `shpat_` token from a custom app), it will still work as a fallback when no OAuth token is found in `.tokens.json`.
