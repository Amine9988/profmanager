#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIST = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "electron", "dist");
const PKG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "electron", "package.json"), "utf8")
);
const VERSION = PKG.version;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const all = walk(DIST);
const dmgs = all.filter((f) => f.toLowerCase().endsWith(".dmg"));
if (!dmgs.length) {
  console.error("No .dmg found under", DIST);
  process.exit(1);
}

const files = dmgs.map((p) => {
  const buf = fs.readFileSync(p);
  return {
    url: path.basename(p),
    sha512: crypto.createHash("sha512").update(buf).digest("base64"),
    size: buf.length,
  };
}).sort((a, b) => a.url.localeCompare(b.url));

const primary = files.find((f) => /-arm64\.dmg$/i.test(f.url)) || files[0];
const yml = [
  `version: ${VERSION}`,
  "files:",
  ...files.flatMap((f) => [
    `  - url: ${f.url}`,
    `    sha512: ${f.sha512}`,
    `    size: ${f.size}`,
  ]),
  `path: ${primary.url}`,
  `sha512: ${primary.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
  `buildId: "${VERSION}-${Date.now()}"`,
  "",
].join("\n");

fs.mkdirSync(DIST, { recursive: true });
const dest = path.join(DIST, "latest-mac.yml");
fs.writeFileSync(dest, yml);
console.log("wrote", dest);
for (const f of files) console.log(" ", f.url, (f.size / 1048576).toFixed(1) + " MB");
