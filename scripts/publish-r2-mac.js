#!/usr/bin/env node
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;
for (const k of ["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET_NAME"]) {
  if (!process.env[k]) { console.error(`Missing ${k}`); process.exit(1); }
}
const ELECTRON_DIR = path.join(__dirname, "..", "electron");
const DIST_DIR = path.join(ELECTRON_DIR, "dist");
const PKG = JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, "package.json"), "utf8"));
const VERSION = PKG.version;
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
async function upload(localPath, key, ct){
  if (!fs.existsSync(localPath)) { console.log(` SKIP ${path.basename(localPath)}`); return; }
  const body = fs.readFileSync(localPath);
  console.log(` UPLOAD ${path.basename(localPath)} (${(body.length/1048576).toFixed(1)} MB) -> ${key}`);
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: ct }));
}
(async()=>{
  console.log(`=== Publish Mac to R2 v${VERSION} ===`);
  const latestMac = path.join(DIST_DIR, "latest-mac.yml");
  // Find dmg/zip files (may contain spaces)
  const files = fs.readdirSync(DIST_DIR).filter(f=> f.endsWith(".dmg") || f.endsWith(".zip") || f.endsWith(".blockmap"));
  console.log("Found files:", files);
  if (fs.existsSync(latestMac)){
    let txt = fs.readFileSync(latestMac,"utf8");
    // Ensure buildId
    if (!txt.includes("buildId:")) txt += `\nbuildId: "${VERSION}-${Date.now()}"\n`;
    fs.writeFileSync(latestMac, txt);
  }
  for(const f of files){
    await upload(path.join(DIST_DIR,f), `v${VERSION}/${f}`, "application/octet-stream");
    await upload(path.join(DIST_DIR,f), f, "application/octet-stream");
  }
  if (fs.existsSync(latestMac)){
    await upload(latestMac, `v${VERSION}/latest-mac.yml`, "text/yaml");
    await upload(latestMac, "latest-mac.yml", "text/yaml");
  }
  console.log(`Done Mac publish v${VERSION} -> ${R2_PUBLIC_URL}`);
})().catch(e=>{ console.error(e); process.exit(1); });
