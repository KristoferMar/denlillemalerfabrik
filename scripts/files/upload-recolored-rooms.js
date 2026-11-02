#!/usr/bin/env node
/**
 * Upload the recolored room photos to Shopify Files and write a manifest
 * mapping (room, dlm_id) -> CDN URL.
 *
 * Why a dedicated script (vs. the generic upload-files.js):
 *   - Filenames are namespaced per room (`dlm-room-stue-DLM0101.jpg`) so
 *     200 stue + 200 sovevælse + ... don't collide in Shopify Files.
 *   - We poll fileStatus until UPLOADED so we capture the final CDN URL
 *     (Shopify returns PROCESSING immediately after fileCreate; the URL
 *     isn't valid until the file is fully ingested).
 *   - Idempotent: if the namespaced filename already exists in Files we
 *     reuse its URL instead of re-uploading. Lets us crash and resume.
 *   - Writes images/rooms-recolored/manifest.json organised
 *     { room: { dlm_id: url, ... }, ... } so the configurator wiring step
 *     can pick whichever rooms it wants without re-querying Shopify.
 *
 * Usage:
 *   node scripts/files/upload-recolored-rooms.js
 *   node scripts/files/upload-recolored-rooms.js --dry-run
 *   node scripts/files/upload-recolored-rooms.js --room stue
 *   node scripts/files/upload-recolored-rooms.js --limit 5
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename, extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const RECOLOR_DIR = resolve(REPO_ROOT, "images/rooms-recolored");
const MANIFEST_PATH = resolve(RECOLOR_DIR, "manifest.json");

const DRY_RUN = process.argv.includes("--dry-run");
const FILTER_ROOM = readArg("--room");
const FILTER_COLOR = readArg("--color"); // e.g. "DLM0402" to upload only Mynte
const LIMIT = readArg("--limit") ? parseInt(readArg("--limit"), 10) : null;

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveManifest(manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

// Filename convention: `dlm-room-{room}-{dlm_id}.{ext}` so all 1000
// images sit in Shopify Files as a discoverable group.
function namespacedFilename(room, dlmId, ext) {
  return `dlm-room-${room}-${dlmId}${ext}`;
}

// ── Discover local files ─────────────────────────────────────────────

function collectImages() {
  const jobs = [];
  if (!existsSync(RECOLOR_DIR)) return jobs;

  for (const room of readdirSync(RECOLOR_DIR).sort()) {
    if (room.startsWith(".") || room === "manifest.json") continue;
    if (FILTER_ROOM && room !== FILTER_ROOM) continue;
    const roomDir = resolve(RECOLOR_DIR, room);
    if (!statSync(roomDir).isDirectory()) continue;

    // We only have `full` variation today, but keep the structure
    // ready for `accent` if it's ever added.
    for (const variation of readdirSync(roomDir).sort()) {
      const variationDir = resolve(roomDir, variation);
      if (!statSync(variationDir).isDirectory()) continue;
      if (variation !== "full") continue; // only full for now

      for (const fname of readdirSync(variationDir).sort()) {
        if (!/^DLM\d{4}\.(jpe?g|png|webp)$/i.test(fname)) continue;
        const dlmId = basename(fname, extname(fname));
        if (FILTER_COLOR && dlmId !== FILTER_COLOR) continue;
        jobs.push({
          room,
          variation,
          dlmId,
          localPath: resolve(variationDir, fname),
          uploadName: namespacedFilename(room, dlmId, extname(fname).toLowerCase()),
        });
      }
    }
  }
  return jobs;
}

// ── Shopify Files API ────────────────────────────────────────────────

const STAGED_UPLOAD = `
  mutation StagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        resourceUrl
        url
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `
  mutation CreateFile($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus alt }
      userErrors { field message }
    }
  }
`;

const FILE_QUERY = `
  query GetFile($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        fileStatus
        image { url width height }
      }
    }
  }
`;

const FIND_FILE = `
  query FindFile($query: String!) {
    files(first: 5, query: $query) {
      nodes {
        ... on MediaImage {
          id
          fileStatus
          alt
          image { url }
        }
      }
    }
  }
`;

function mimeFromName(fname) {
  const ext = extname(fname).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext]
    || "application/octet-stream";
}

// Look up by alt-text (which we set to the namespaced filename) so we
// can recognise files we've already uploaded.
async function findExistingByAlt(altText) {
  // Shopify's `files` query supports alt: prefix
  const data = await shopifyGraphQL(FIND_FILE, { query: `alt:${JSON.stringify(altText)}` });
  for (const node of data.files.nodes) {
    if (node && node.alt === altText && node.image?.url) {
      return node.image.url;
    }
  }
  return null;
}

async function stageAndCreate(localPath, uploadName) {
  const buf = readFileSync(localPath);
  const mimeType = mimeFromName(uploadName);

  const stagedData = await shopifyGraphQL(STAGED_UPLOAD, {
    input: [{
      filename: uploadName,
      mimeType,
      fileSize: String(buf.length),
      httpMethod: "POST",
      resource: "FILE",
    }],
  });
  const stagedErr = stagedData.stagedUploadsCreate.userErrors;
  if (stagedErr.length) throw new Error(`stagedUploadsCreate: ${stagedErr[0].message}`);
  const target = stagedData.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buf], { type: mimeType }), uploadName);
  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`upload to staged: HTTP ${uploadRes.status}: ${await uploadRes.text()}`);
  }

  const createData = await shopifyGraphQL(FILE_CREATE, {
    files: [{
      originalSource: target.resourceUrl,
      alt: uploadName,         // <- our recovery key; findExistingByAlt() looks for this
      contentType: "IMAGE",
    }],
  });
  const createErr = createData.fileCreate.userErrors;
  if (createErr.length) throw new Error(`fileCreate: ${createErr[0].message}`);
  return createData.fileCreate.files[0].id;
}

// Shopify takes 1-10 seconds to ingest a file. fileCreate returns
// PROCESSING; we poll until UPLOADED to capture the final CDN URL.
async function waitForUrl(fileId, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await shopifyGraphQL(FILE_QUERY, { id: fileId });
    const node = data.node;
    if (node?.fileStatus === "READY" || node?.fileStatus === "UPLOADED") {
      if (node.image?.url) return node.image.url;
    }
    if (node?.fileStatus === "FAILED") throw new Error(`file ingest failed`);
    await sleep(1000);
  }
  throw new Error(`timed out waiting for file ${fileId}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  let jobs = collectImages();
  if (LIMIT) jobs = jobs.slice(0, LIMIT);

  if (jobs.length === 0) {
    console.log(`No images found under ${RECOLOR_DIR.replace(REPO_ROOT + "/", "")}.`);
    return;
  }

  const manifest = loadManifest();
  const totalBytes = jobs.reduce((n, j) => n + statSync(j.localPath).size, 0);
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}` +
    `Uploading ${jobs.length} images (${(totalBytes / 1024 / 1024).toFixed(1)} MB total)\n`);

  let uploaded = 0, reused = 0, failed = 0;
  const startedAt = Date.now();

  for (const job of jobs) {
    const { room, dlmId, variation, localPath, uploadName } = job;
    manifest[room] ??= {};
    manifest[room][variation] ??= {};

    if (manifest[room][variation][dlmId]) {
      // Already in manifest — trust it
      reused++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ${uploadName}`);
      continue;
    }

    process.stdout.write(`  ${uploadName} `);
    try {
      // First, check whether this file already exists on Shopify Files
      // (e.g. left over from an aborted previous run).
      let url = await findExistingByAlt(uploadName);
      if (url) {
        process.stdout.write("(reused) ");
        reused++;
      } else {
        const fileId = await stageAndCreate(localPath, uploadName);
        process.stdout.write("ingesting ");
        url = await waitForUrl(fileId);
        uploaded++;
      }
      manifest[room][variation][dlmId] = url;

      // Persist after every successful upload so a crash doesn't lose
      // the work we've done.
      saveManifest(manifest);

      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = jobs.length - uploaded - reused - failed;
      const eta = uploaded > 0 ? (elapsed / uploaded) * remaining : 0;
      console.log(`done  (${uploaded + reused}/${jobs.length}, ETA ${eta.toFixed(0)}s)`);
    } catch (e) {
      failed++;
      console.log(`ERROR: ${e.message}`);
    }

    // Stay under Shopify's 4 API calls/sec rate limit (we do ~3 calls
    // per upload). 250 ms between iterations is plenty of headroom.
    await sleep(250);
  }

  const elapsedM = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log();
  console.log(`Done in ${elapsedM} min — uploaded ${uploaded}, reused ${reused}, failed ${failed}.`);
  console.log(`Manifest: ${MANIFEST_PATH.replace(REPO_ROOT + "/", "")}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
