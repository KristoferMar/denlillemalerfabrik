#!/usr/bin/env node
/**
 * Probe test: does the current token work for URL redirects via REST
 * and via GraphQL? Helps isolate whether the issue is the scope name
 * or the API surface.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, "..");

// Load .env
const envPath = resolve(SCRIPTS_DIR, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()])
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const STORE = (process.env.SHOPIFY_STORE ?? "").replace(/\.myshopify\.com$/, "");
const TOKENS = JSON.parse(readFileSync(resolve(SCRIPTS_DIR, ".tokens.json"), "utf-8"));
const TOKEN = TOKENS[STORE];

if (!TOKEN) {
  console.error(`No token for ${STORE}.`);
  process.exit(1);
}

async function tryRest() {
  const url = `https://${STORE}.myshopify.com/admin/api/2025-01/redirects.json?limit=5`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  console.log(`REST  GET /redirects.json  →  ${res.status} ${res.statusText}`);
  const body = await res.text();
  console.log(`        body (first 200): ${body.slice(0, 200)}`);
}

async function tryGraphQL() {
  const url = `https://${STORE}.myshopify.com/admin/api/2025-01/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({
      query: `{ urlRedirects(first: 1) { nodes { id } } }`,
    }),
  });
  const body = await res.json();
  if (body.errors) {
    console.log(`GQL   urlRedirects  →  ERRORS: ${JSON.stringify(body.errors).slice(0, 250)}`);
  } else {
    console.log(`GQL   urlRedirects  →  OK (${body.data.urlRedirects.nodes.length} nodes)`);
  }
}

console.log(`Store: ${STORE}.myshopify.com\n`);
await tryRest();
console.log();
await tryGraphQL();
