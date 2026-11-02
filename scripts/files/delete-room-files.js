#!/usr/bin/env node
/**
 * Delete all recolored-room images for one room from Shopify Files.
 *
 * Paired with upload-recolored-rooms.js: when a base photo gets
 * regenerated and the entire palette is re-rendered against the new
 * mask, the old uploads need to come out of Shopify Files first.
 * Otherwise the upload script's idempotency layer (alt-text check)
 * sees the old files and reuses their URLs, and nothing actually
 * changes on the storefront.
 *
 * Match logic:
 *   The upload script names files `dlm-room-<room>-DLM####.<ext>` and
 *   stores the same string as `alt`. We query Files by that alt
 *   prefix, then issue fileDelete for each matching file.
 *
 * Manifest:
 *   The matching block under `images/rooms-recolored/manifest.json`
 *   (the `<room>` key) is also stripped, so the upload script doesn't
 *   short-circuit on stale entries.
 *
 * Usage:
 *   node scripts/files/delete-room-files.js --room badevaerelse           # dry run
 *   node scripts/files/delete-room-files.js --room badevaerelse --confirm # actually delete
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const MANIFEST_PATH = resolve(REPO_ROOT, "images/rooms-recolored/manifest.json");

const CONFIRM = process.argv.includes("--confirm");
const ROOM = readArg("--room");

if (!ROOM) {
  console.error("error: --room <slug> required (e.g. --room badevaerelse)");
  process.exit(1);
}

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── Query helpers ────────────────────────────────────────────────────

// Shopify's `files` query supports an `alt:` filter, but it does NOT
// support wildcards there — we have to fetch by prefix and filter
// client-side. The query expression below uses the `alt:` prefix to
// pre-narrow the dataset on the server.
const LIST_FILES = `
  query ListFiles($cursor: String) {
    files(first: 100, after: $cursor, query: "alt:dlm-room-${ROOM}") {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on MediaImage {
          id
          alt
          image { url }
        }
      }
    }
  }
`;

const FILE_DELETE = `
  mutation FileDelete($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors { field message }
    }
  }
`;

async function collectAllMatches() {
  const matches = [];
  let cursor = null;
  for (;;) {
    const data = await shopifyGraphQL(LIST_FILES, { cursor });
    for (const node of data.files.nodes) {
      // Defensive: re-check the prefix client-side because the `alt:`
      // operator does a contains match in some cases.
      if (node?.alt?.startsWith(`dlm-room-${ROOM}-`)) {
        matches.push({ id: node.id, alt: node.alt });
      }
    }
    if (!data.files.pageInfo.hasNextPage) break;
    cursor = data.files.pageInfo.endCursor;
    await sleep(150);
  }
  return matches;
}

// Shopify's fileDelete accepts up to 250 IDs per call, but we batch in
// chunks of 25 to stay well under any partial-failure cliff and to
// produce useful progress output.
async function deleteInBatches(matches) {
  const BATCH = 25;
  let deleted = 0;
  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const ids = batch.map((m) => m.id);
    const data = await shopifyGraphQL(FILE_DELETE, { fileIds: ids });
    const err = data.fileDelete.userErrors;
    if (err.length) {
      console.error(`  batch ${i / BATCH + 1} userErrors:`, err);
    }
    deleted += data.fileDelete.deletedFileIds.length;
    console.log(`  batch ${i / BATCH + 1}: deleted ${data.fileDelete.deletedFileIds.length} / ${batch.length}`);
    await sleep(250);
  }
  return deleted;
}

// ── Manifest cleanup ────────────────────────────────────────────────

function stripManifestRoom() {
  if (!existsSync(MANIFEST_PATH)) {
    console.log(`  manifest: ${MANIFEST_PATH.replace(REPO_ROOT + "/", "")} doesn't exist, skipping`);
    return 0;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  if (!manifest[ROOM]) {
    console.log(`  manifest: no entry for ${ROOM}, skipping`);
    return 0;
  }
  const before = Object.values(manifest[ROOM]).reduce(
    (n, v) => n + (typeof v === "object" ? Object.keys(v).length : 0), 0
  );
  delete manifest[ROOM];
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  return before;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`${CONFIRM ? "" : "[DRY RUN] "}Looking for Shopify Files matching dlm-room-${ROOM}-*`);
  const matches = await collectAllMatches();

  console.log(`Found ${matches.length} file(s).`);
  if (matches.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Show a sample so the user can verify before --confirm.
  const sample = matches.slice(0, 5).map((m) => `  - ${m.alt}`).join("\n");
  console.log("Sample:");
  console.log(sample);
  if (matches.length > 5) console.log(`  ... and ${matches.length - 5} more`);

  if (!CONFIRM) {
    console.log("\nThis was a dry run. Re-run with --confirm to actually delete.");
    return;
  }

  console.log("\nDeleting from Shopify...");
  const deleted = await deleteInBatches(matches);
  console.log(`Done — ${deleted}/${matches.length} files removed from Shopify.`);

  console.log("\nStripping manifest entry...");
  const stripped = stripManifestRoom();
  console.log(`  manifest: removed ${stripped} ${ROOM} entries.`);

  console.log(`\nNext: re-upload with`);
  console.log(`  node scripts/files/upload-recolored-rooms.js --room ${ROOM}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
