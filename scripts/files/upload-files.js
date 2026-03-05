#!/usr/bin/env node
/**
 * Upload local images to Shopify Files.
 *
 * Usage:
 *   node upload-files.js ../../color-lab-images/colors          Upload all images recursively
 *   node upload-files.js ../../color-lab-images/colors/salvie   Upload one folder
 *   node upload-files.js --dry-run ../../color-lab-images/colors Preview only
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, extname } from "node:path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const DRY_RUN = process.argv.includes("--dry-run");

function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return types[ext] || "application/octet-stream";
}

function collectImages(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectImages(full));
    } else if (IMAGE_EXTENSIONS.includes(extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results.sort();
}

async function createStagedUpload(filename, fileSize, mimeType) {
  const data = await shopifyGraphQL(
    `
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
  `,
    {
      input: [
        {
          filename,
          mimeType,
          fileSize: String(fileSize),
          httpMethod: "POST",
          resource: "FILE",
        },
      ],
    }
  );

  const errors = data.stagedUploadsCreate.userErrors;
  if (errors.length > 0) throw new Error(`Staged upload: ${errors[0].message}`);
  return data.stagedUploadsCreate.stagedTargets[0];
}

async function uploadToStaged(target, filePath) {
  const fileBuffer = readFileSync(filePath);
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", new Blob([fileBuffer]), basename(filePath));

  const res = await fetch(target.url, { method: "POST", body: formData });
  if (!res.ok && res.status !== 201) {
    throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  }
  return target.resourceUrl;
}

async function createFile(resourceUrl, filename) {
  const data = await shopifyGraphQL(
    `
    mutation CreateFile($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus }
        userErrors { field message }
      }
    }
  `,
    {
      files: [
        {
          originalSource: resourceUrl,
          alt: filename.replace(extname(filename), "").replaceAll("-", " "),
          contentType: "IMAGE",
        },
      ],
    }
  );

  const errors = data.fileCreate.userErrors;
  if (errors.length > 0) throw new Error(`File create: ${errors[0].message}`);
  return data.fileCreate.files[0];
}

async function main() {
  const args = process.argv.filter(
    (a) => !a.startsWith("--") && !a.includes("node") && !a.includes("upload-files")
  );
  const targetPath = args[0];

  if (!targetPath) {
    console.log("Usage: node upload-files.js <path-to-folder> [--dry-run]");
    process.exit(1);
  }

  const dir = resolve(targetPath);
  const images = collectImages(dir);

  if (images.length === 0) {
    console.log(`No images found in ${dir}`);
    return;
  }

  console.log(`Found ${images.length} image(s) to upload${DRY_RUN ? " (dry run)" : ""}:\n`);

  for (const filePath of images) {
    const filename = basename(filePath);
    const fileSize = statSync(filePath).size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1);

    if (DRY_RUN) {
      console.log(`  ${filename} (${sizeMB} MB)`);
      continue;
    }

    process.stdout.write(`  ${filename} (${sizeMB} MB)...`);

    const mimeType = getMimeType(filename);
    const target = await createStagedUpload(filename, fileSize, mimeType);
    const resourceUrl = await uploadToStaged(target, filePath);
    process.stdout.write(" uploaded...");

    await createFile(resourceUrl, filename);
    console.log(" done");

    await sleep(300);
  }

  console.log(`\nFinished!`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
