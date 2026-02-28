#!/usr/bin/env node
/**
 * Syncs local images from color-lab-images/<handle>/ to the matching
 * color_combination metaobject in Shopify.
 *
 * For each subfolder it:
 *   1. Uploads images via Shopify's Staged Uploads API
 *   2. Creates file entries in Shopify's Files section
 *   3. Waits for files to be READY
 *   4. Updates the metaobject's "images" field with file references
 *
 * Usage:
 *   node sync-color-lab-images.js                     Sync all combinations
 *   node sync-color-lab-images.js scandinavian-warm    Sync one combination
 *   node sync-color-lab-images.js --dry-run            Preview without uploading
 */

import { shopifyGraphQL, sleep } from "../shopify-client.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = resolve(__dirname, "../../color-lab-images");
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Helpers ────────────────────────────────────────────────────────

function getImageFiles(folderPath) {
  try {
    return readdirSync(folderPath)
      .filter((f) => {
        const ext = extname(f).toLowerCase();
        return IMAGE_EXTENSIONS.includes(ext) && !f.startsWith(".");
      })
      .sort();
  } catch {
    return [];
  }
}

function getFolders() {
  try {
    return readdirSync(IMAGES_DIR).filter((f) => {
      const fullPath = resolve(IMAGES_DIR, f);
      return statSync(fullPath).isDirectory() && !f.startsWith(".");
    });
  } catch {
    return [];
  }
}

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

// ─── Shopify: Find metaobject by handle ────────────────────────────

async function findMetaobjectByHandle(handle) {
  const data = await shopifyGraphQL(
    `
    query FindCombo($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        id
        handle
        displayName
        fields {
          key
          value
        }
      }
    }
  `,
    {
      handle: {
        type: "color_combination",
        handle,
      },
    }
  );
  return data.metaobjectByHandle;
}

// ─── Shopify: Staged Upload ────────────────────────────────────────

async function createStagedUpload(filename, fileSize, mimeType) {
  const data = await shopifyGraphQL(
    `
    mutation StagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          resourceUrl
          url
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
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
  if (errors.length > 0) {
    throw new Error(`Staged upload error: ${errors[0].message}`);
  }

  return data.stagedUploadsCreate.stagedTargets[0];
}

// ─── Upload file to staged target ──────────────────────────────────

async function uploadToStaged(target, filePath) {
  const fileBuffer = readFileSync(filePath);

  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", new Blob([fileBuffer]), basename(filePath));

  const res = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  return target.resourceUrl;
}

// ─── Shopify: Create file entry ────────────────────────────────────

async function createFile(resourceUrl, filename) {
  const data = await shopifyGraphQL(
    `
    mutation CreateFile($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      files: [
        {
          originalSource: resourceUrl,
          alt: filename,
          contentType: "IMAGE",
        },
      ],
    }
  );

  const errors = data.fileCreate.userErrors;
  if (errors.length > 0) {
    throw new Error(`File create error: ${errors[0].message}`);
  }

  return data.fileCreate.files[0];
}

// ─── Shopify: Poll until file is READY ─────────────────────────────

async function waitForFile(fileId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await shopifyGraphQL(
      `
      query FileStatus($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on MediaImage {
            id
            fileStatus
          }
          ... on GenericFile {
            id
            fileStatus
          }
        }
      }
    `,
      { ids: [fileId] }
    );

    const node = data.nodes[0];
    if (!node) {
      throw new Error(`File ${fileId} not found`);
    }

    if (node.fileStatus === "READY") {
      return node;
    }

    if (node.fileStatus === "FAILED") {
      throw new Error(`File ${fileId} processing failed`);
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for file ${fileId}`);
}

// ─── Shopify: Update metaobject images field ───────────────────────

async function updateMetaobjectImages(metaobjectId, fileIds) {
  const data = await shopifyGraphQL(
    `
    mutation UpdateImages($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject {
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      id: metaobjectId,
      metaobject: {
        fields: [
          {
            key: "images",
            value: JSON.stringify(fileIds),
          },
        ],
      },
    }
  );

  const errors = data.metaobjectUpdate.userErrors;
  if (errors.length > 0) {
    throw new Error(`Metaobject update error: ${errors[0].message}`);
  }
}

// ─── Process one combination folder ────────────────────────────────

async function syncFolder(handle) {
  const folderPath = resolve(IMAGES_DIR, handle);
  const images = getImageFiles(folderPath);

  if (images.length === 0) {
    console.log(`  (no images, skipping)`);
    return;
  }

  // Find the metaobject
  const metaobject = await findMetaobjectByHandle(handle);
  if (!metaobject) {
    console.log(`  Metaobject not found for handle "${handle}", skipping`);
    return;
  }

  console.log(`  Found metaobject: ${metaobject.displayName || handle}`);
  console.log(`  Images to upload: ${images.length}`);

  if (DRY_RUN) {
    for (const img of images) {
      console.log(`    - ${img}`);
    }
    return;
  }

  const fileIds = [];

  for (const img of images) {
    const filePath = resolve(folderPath, img);
    const fileSize = statSync(filePath).size;
    const mimeType = getMimeType(img);

    process.stdout.write(`    Uploading ${img}...`);

    // 1. Create staged upload
    const target = await createStagedUpload(img, fileSize, mimeType);

    // 2. Upload file
    const resourceUrl = await uploadToStaged(target, filePath);

    // 3. Create file in Shopify
    const file = await createFile(resourceUrl, img);
    process.stdout.write(` created...`);

    // 4. Wait for processing
    await waitForFile(file.id);
    console.log(` ready`);

    fileIds.push(file.id);
    await sleep(300);
  }

  // 5. Update metaobject
  console.log(`  Updating metaobject with ${fileIds.length} images...`);
  await updateMetaobjectImages(metaobject.id, fileIds);
  console.log(`  Done!`);
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  // Check for a specific handle argument
  const args = process.argv.filter(
    (a) => !a.startsWith("--") && !a.includes("node") && !a.includes("sync-color-lab-images")
  );
  const targetHandle = args[0];

  if (DRY_RUN) {
    console.log("DRY RUN — no uploads will be made.\n");
  }

  const folders = targetHandle ? [targetHandle] : getFolders();

  if (folders.length === 0) {
    console.log(`No folders found in ${IMAGES_DIR}`);
    console.log("Create subfolders named after the metaobject handle, e.g.:");
    console.log("  color-lab-images/scandinavian-warm/");
    console.log("  color-lab-images/modern-classic/");
    return;
  }

  console.log(`Syncing ${folders.length} combination(s)...\n`);

  let synced = 0;
  let failed = 0;

  for (const handle of folders) {
    console.log(`\n${handle}/`);

    try {
      await syncFolder(handle);
      synced++;
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Synced: ${synced}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
