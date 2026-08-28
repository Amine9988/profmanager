#!/usr/bin/env node
/**
 * publish-r2.js
 *
 * Uploads build artifacts to Cloudflare R2 via S3 API.
 * Uses @aws-sdk/client-s3 (no AWS CLI needed).
 *
 * Usage:
 *   node scripts/publish-r2.js
 *
 * Env vars (set in .env):
 *   R2_ACCOUNT_ID       Cloudflare account ID
 *   R2_ACCESS_KEY_ID    R2 API token access key
 *   R2_SECRET_ACCESS_KEY R2 API token secret key
 *   R2_BUCKET_NAME      R2 bucket name
 *   R2_PUBLIC_URL       Public URL (e.g. https://releases.profmanager.com)
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// Load .env
const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  const lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: ${name} is not set. Add it to .env or export it.`);
    process.exit(1);
  }
  return v;
}

required("R2_ACCOUNT_ID");
required("R2_ACCESS_KEY_ID");
required("R2_SECRET_ACCESS_KEY");
required("R2_BUCKET_NAME");
required("R2_PUBLIC_URL");

const ELECTRON_DIR = path.join(__dirname, "..", "electron");
const DIST_DIR = path.join(ELECTRON_DIR, "dist");
const PKG = JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, "package.json"), "utf8"));
const VERSION = PKG.version;
const BUILD_ID = `${VERSION}-${Date.now()}`;

console.log(`=== Publish to R2 ===`);
console.log(`  Version:  ${VERSION}`);
console.log(`  Build ID: ${BUILD_ID}`);
console.log(`  Bucket:   ${R2_BUCKET_NAME}`);
console.log(`  Public:   ${R2_PUBLIC_URL}`);
console.log();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function uploadFile(localPath, key, contentType) {
  if (!fs.existsSync(localPath)) {
    console.log(`  SKIP ${path.basename(localPath)} (not found)`);
    return;
  }
  const body = fs.readFileSync(localPath);
  const sizeMB = (body.length / 1048576).toFixed(1);
  console.log(`  UPLOAD ${path.basename(localPath)} (${sizeMB} MB) → s3://${R2_BUCKET_NAME}/${key}`);
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

async function main() {
  // electron-builder NSIS names files with spaces: "ProfManager Setup X.X.X.exe"
  const setupExeSpaced = `ProfManager Setup ${VERSION}.exe`;
  const setupExe = `ProfManager-Setup-${VERSION}.exe`;
  const setupPath = path.join(DIST_DIR, setupExeSpaced);
  const blockmapPath = path.join(DIST_DIR, `${setupExeSpaced}.blockmap`);
  const latestPath = path.join(DIST_DIR, "latest.yml");

  // Add buildId to latest.yml + fix filename references
  let latestContent = fs.readFileSync(latestPath, "utf8");
  if (!latestContent.includes("buildId:")) {
    latestContent += `\nbuildId: "${BUILD_ID}"\n`;
  }
  // electron-builder names installer with spaces but we upload with hyphens
  latestContent = latestContent.replaceAll(setupExeSpaced, setupExe);
  fs.writeFileSync(latestPath, latestContent, "utf8");

  // 1. Upload versioned archive
  console.log(`[1/3] Uploading versioned archive (v${VERSION})...`);
  await uploadFile(setupPath, `v${VERSION}/${setupExe}`, "application/octet-stream");
  await uploadFile(blockmapPath, `v${VERSION}/${setupExe}.blockmap`, "application/octet-stream");
  await uploadFile(latestPath, `v${VERSION}/latest.yml`, "text/yaml");

  // 2. Upload latest files to ROOT (electron-updater resolves relative URLs from here)
  console.log(`\n[2/3] Updating root (electron-updater reads these)...`);
  await uploadFile(setupPath, setupExe, "application/octet-stream");
  await uploadFile(blockmapPath, `${setupExe}.blockmap`, "application/octet-stream");
  await uploadFile(latestPath, "latest.yml", "text/yaml");

  console.log(`\n=== Done ===`);
  console.log(`  Versioned archive: ${R2_PUBLIC_URL}/v${VERSION}/`);
  console.log(`  Latest files:      ${R2_PUBLIC_URL}/${setupExe}`);
  console.log(`  Build ID:          ${BUILD_ID}`);
  console.log(`\n  electron-updater URL: ${R2_PUBLIC_URL}/latest.yml`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
