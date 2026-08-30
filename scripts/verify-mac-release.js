#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");
const { unzip, verifyMacRelease, syncFromR2 } = require("./mac-dist-utils");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "electron", "dist");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "electron", "package.json"), "utf8")).version;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testUnzipSpacedPath() {
  const spaced = path.join(os.tmpdir(), "pm test  dir");
  fs.mkdirSync(spaced, { recursive: true });
  const payload = path.join(spaced, "hello.txt");
  fs.writeFileSync(payload, "ok");
  const zip = path.join(spaced, "sample.zip");
  execFileSync("tar", ["-a", "-cf", zip, "-C", spaced, "hello.txt"], { windowsHide: true });
  const out = path.join(spaced, "out");
  fs.mkdirSync(out, { recursive: true });
  unzip(zip, out);
  assert(fs.existsSync(path.join(out, "hello.txt")), "unzip did not extract hello.txt");
  assert(fs.readFileSync(path.join(out, "hello.txt"), "utf8") === "ok", "unzip payload mismatch");
  fs.rmSync(spaced, { recursive: true, force: true });
  console.log("ok unzip on a path with spaces");
}

(async () => {
  testUnzipSpacedPath();

  assert(fs.existsSync(path.join(ROOT, "electron", "install-mac.command")), "missing install-mac.command");
  assert(fs.existsSync(path.join(ROOT, "electron", "open-first.html")), "missing open-first.html");
  assert(fs.existsSync(path.join(ROOT, "electron", "after-pack.js")), "missing after-pack.js");
  const after = fs.readFileSync(path.join(ROOT, "electron", "after-pack.js"), "utf8");
  assert(!/codesign --force --deep --sign -/.test(after), "after-pack still ad-hoc signs");
  assert(/remove-signature/.test(after), "after-pack must strip signatures");
  const updater = fs.readFileSync(path.join(ROOT, "electron", "updater.js"), "utf8");
  assert(updater.includes("latest-mac.yml"), "updater missing latest-mac.yml");
  console.log("ok packaging files");

  await syncFromR2(DIST);
  const meta = await verifyMacRelease(DIST, VERSION);
  console.log("ALL OK Mac release v" + meta.version + " (" + meta.files.map((f) => f.url).join(", ") + ")");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
