#!/usr/bin/env node
/**
 * OAuth authentication for Shopify stores via a Partners app.
 *
 * Performs the Authorization Code Grant flow:
 *   1. Starts a local HTTP server on port 3456
 *   2. Opens the browser to Shopify's authorize endpoint
 *   3. Receives the callback with the authorization code
 *   4. Validates the HMAC signature
 *   5. Exchanges the code for a permanent access token
 *   6. Saves the token in .tokens.json keyed by store name
 *
 * Usage:
 *   node auth.js <store-name>            — authenticate against a store
 *   node auth.js --list                  — show all stored tokens
 *   node auth.js --revoke <store-name>   — remove a stored token
 *
 * Prerequisites:
 *   - SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env
 *   - http://localhost:3456/callback added as redirect URL in Partners dashboard
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ──────────────────────────────────────────────────────

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

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const TOKENS_PATH = resolve(__dirname, ".tokens.json");
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES =
  "read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,read_products,write_products,read_files,write_files";
const PORT = 3456;

// ─── Token storage helpers ──────────────────────────────────────────

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) return {};
  return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n");
}

// ─── HMAC validation ────────────────────────────────────────────────

function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Sort parameters alphabetically and build the message
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("&");

  const computed = createHmac("sha256", CLIENT_SECRET)
    .update(message)
    .digest("hex");

  // Constant-time comparison
  if (computed.length !== hmac.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Exchange authorization code for access token ───────────────────

async function exchangeCodeForToken(store, code) {
  const url = `https://${store}.myshopify.com/admin/oauth/access_token`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}

// ─── Open browser (cross-platform) ─────────────────────────────────

async function openBrowser(url) {
  const { exec } = await import("node:child_process");
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

// ─── Subcommand: --list ─────────────────────────────────────────────

function listTokens() {
  const tokens = loadTokens();
  const stores = Object.keys(tokens);

  if (stores.length === 0) {
    console.log("\nNo stored tokens. Run: node auth.js <store-name>\n");
    return;
  }

  console.log("\nStored tokens:\n");
  for (const store of stores) {
    const token = tokens[store];
    const masked = token.slice(0, 8) + "..." + token.slice(-4);
    console.log(`  ${store}.myshopify.com  →  ${masked}`);
  }
  console.log();
}

// ─── Subcommand: --revoke ───────────────────────────────────────────

function revokeToken(store) {
  const tokens = loadTokens();

  if (!tokens[store]) {
    console.error(`\nNo token found for "${store}".\n`);
    process.exit(1);
  }

  delete tokens[store];
  saveTokens(tokens);
  console.log(`\nToken for "${store}" removed.\n`);
}

// ─── Main: OAuth flow ───────────────────────────────────────────────

async function authenticate(store) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in .env.\n" +
        "Add them from your Partners dashboard."
    );
    process.exit(1);
  }

  const nonce = randomBytes(16).toString("hex");

  const authUrl =
    `https://${store}.myshopify.com/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${nonce}`;

  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      try {
        // Parse query parameters
        const query = Object.fromEntries(url.searchParams.entries());

        // Validate state (CSRF protection)
        if (query.state !== nonce) {
          throw new Error("State mismatch — possible CSRF attack.");
        }

        // Validate HMAC
        if (!verifyHmac(query)) {
          throw new Error("HMAC validation failed — callback may be tampered.");
        }

        // Exchange code for token
        const code = query.code;
        if (!code) throw new Error("No authorization code in callback.");

        console.log("  Exchanging code for access token...");
        const accessToken = await exchangeCodeForToken(store, code);

        // Save token
        const tokens = loadTokens();
        tokens[store] = accessToken;
        saveTokens(tokens);

        const masked = accessToken.slice(0, 8) + "..." + accessToken.slice(-4);
        console.log(`  Token saved: ${masked}`);
        console.log(`\nDone! "${store}" is now authenticated.\n`);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body style='font-family:system-ui;text-align:center;padding:4em'>" +
            "<h1>Authenticated!</h1>" +
            `<p>Token for <strong>${store}</strong> has been saved.</p>` +
            "<p>You can close this tab.</p>" +
            "</body></html>"
        );

        server.close();
        resolvePromise();
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body style='font-family:system-ui;text-align:center;padding:4em'>" +
            `<h1>Error</h1><p>${err.message}</p>` +
            "</body></html>"
        );
        server.close();
        rejectPromise(err);
      }
    });

    server.listen(PORT, () => {
      console.log(`\nAuthenticating "${store}"...`);
      console.log(`  Callback server listening on http://localhost:${PORT}`);
      console.log(`  Opening browser...\n`);
      openBrowser(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      rejectPromise(new Error("Timed out waiting for OAuth callback (5 min)."));
    }, 5 * 60 * 1000);
  });
}

// ─── CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--list")) {
  listTokens();
} else if (args.includes("--revoke")) {
  const idx = args.indexOf("--revoke");
  const store = args[idx + 1];
  if (!store) {
    console.error("Usage: node auth.js --revoke <store-name>");
    process.exit(1);
  }
  revokeToken(store);
} else if (args.length === 1 && !args[0].startsWith("--")) {
  authenticate(args[0]).catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
} else {
  console.log(`
Usage:
  node auth.js <store-name>            Authenticate against a store
  node auth.js --list                  Show all stored tokens
  node auth.js --revoke <store-name>   Remove a stored token

Example:
  node auth.js den-lille-malerfabrik
`);
}
