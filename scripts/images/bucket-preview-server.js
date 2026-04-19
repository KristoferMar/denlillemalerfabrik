#!/usr/bin/env node
/**
 * Tiny local server for the bucket-preview tool.
 *
 * - Serves the preview HTML + the bucket image at http://localhost:9000
 * - Exposes POST /save?filename=foo.png which writes the PNG body to
 *   images/products/processed/{filename} — no browser "Save as" dialog,
 *   no copying from Downloads.
 *
 * Usage:
 *   node scripts/images/bucket-preview-server.js
 *   # then open http://localhost:9000/scripts/images/bucket-preview.html
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const SAVE_DIR = resolve(PROJECT_ROOT, "images/products/processed");
const PORT = 9000;

if (!existsSync(SAVE_DIR)) {
  await mkdir(SAVE_DIR, { recursive: true });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function sanitizeFilename(name) {
  // Strip any directory components and keep only safe chars
  const base = name.split(/[/\\]/).pop() || "bucket.png";
  return base.replace(/[^a-zA-Z0-9æøåÆØÅ._-]/g, "_");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ─── POST /save ─────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/save") {
    try {
      const filename = sanitizeFilename(
        url.searchParams.get("filename") || "bucket.png"
      );
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      const outPath = join(SAVE_DIR, filename);
      await writeFile(outPath, body);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: outPath, size: body.length }));
      console.log(`  ✓ saved ${filename} (${body.length} bytes)`);
    } catch (err) {
      console.error(`  ✗ save failed: ${err.message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // ─── Redirect / → preview ──────────────────────────────────
  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/scripts/images/bucket-preview.html" });
    res.end();
    return;
  }

  // ─── Static file serving (scoped to project root) ──────────
  try {
    const safePath = url.pathname.replace(/^\/+/, "");
    const filePath = resolve(PROJECT_ROOT, safePath);
    if (!filePath.startsWith(PROJECT_ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\nBucket preview server running.`);
  console.log(`  URL:        http://localhost:${PORT}/scripts/images/bucket-preview.html`);
  console.log(`  Save path:  ${SAVE_DIR}`);
  console.log(`\nDownloads via the "Download PNG" button save directly here.`);
  console.log(`Press Ctrl+C to stop.\n`);
});
