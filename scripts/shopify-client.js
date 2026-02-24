/**
 * Shared Shopify Admin API client for metaobject scripts.
 *
 * Token resolution (in priority order):
 *   1. --store <name> CLI flag  → look up in .tokens.json
 *   2. SHOPIFY_STORE from .env  → look up in .tokens.json, fall back to SHOPIFY_ACCESS_TOKEN
 *   3. Direct SHOPIFY_ACCESS_TOKEN in .env (backwards-compatible)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env manually (no dependencies needed) ───────────────────

const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Token storage ──────────────────────────────────────────────────

const TOKENS_PATH = resolve(__dirname, ".tokens.json");

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) return {};
  return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
}

// ─── Parse --store flag from argv ───────────────────────────────────

function parseStoreFlag() {
  const idx = process.argv.indexOf("--store");
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

/**
 * Returns process.argv with --store <value> stripped out,
 * so consumer scripts can parse their own arguments cleanly.
 */
export function getScriptArgs() {
  const args = [...process.argv];
  const idx = args.indexOf("--store");
  if (idx !== -1) {
    args.splice(idx, 2); // remove --store and its value
  }
  return args;
}

// ─── Resolve store + token ──────────────────────────────────────────

function resolveStoreAndToken() {
  const tokens = loadTokens();
  const storeFlag = parseStoreFlag();

  // 1. --store <name> CLI flag
  if (storeFlag) {
    // Accept "name" or "name.myshopify.com"
    const name = storeFlag.replace(/\.myshopify\.com$/, "");
    const store = `${name}.myshopify.com`;
    const token = tokens[name];
    if (!token) {
      console.error(
        `No token found for "${name}".\n` +
          `Run: node auth.js ${name}`
      );
      process.exit(1);
    }
    return { store, token };
  }

  // 2. SHOPIFY_STORE from .env → try .tokens.json first
  const envStore = process.env.SHOPIFY_STORE;
  if (envStore) {
    const name = envStore.replace(/\.myshopify\.com$/, "");
    const store = `${name}.myshopify.com`;

    // Try OAuth token first
    if (tokens[name]) {
      return { store, token: tokens[name] };
    }

    // 3. Fall back to direct SHOPIFY_ACCESS_TOKEN
    const envToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (envToken) {
      return { store, token: envToken };
    }

    console.error(
      `No token for "${name}".\n` +
        `Either run: node auth.js ${name}\n` +
        `Or set SHOPIFY_ACCESS_TOKEN in .env`
    );
    process.exit(1);
  }

  // Nothing configured
  console.error(
    "No store configured.\n" +
      "Set SHOPIFY_STORE in .env, or use --store <name>."
  );
  process.exit(1);
}

const { store: STORE, token: TOKEN } = resolveStoreAndToken();
const API_VERSION = "2025-01";

/**
 * Execute a Shopify Admin GraphQL query.
 */
export async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(
      `GraphQL errors:\n${JSON.stringify(json.errors, null, 2)}`
    );
  }

  return json.data;
}

/**
 * Small helper to pause between API calls (rate-limit friendly).
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
