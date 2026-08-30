#!/usr/bin/env node
const { execSync } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEST = path.join(__dirname, "..", "electron", "platform-tools");
const URL = "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip";

function download(url, destFile) {
  return new Promise((resolve, reject) => {
    const go = (target) => {
      https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return go(res.headers.location);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        const out = fs.createWriteStream(destFile);
        res.pipe(out);
        out.on("finish", () => out.close(resolve));
        out.on("error", reject);
      }).on("error", reject);
    };
    go(url);
  });
}

(async () => {
  if (process.platform !== "darwin") {
    console.log("skip fetch-mac-platform-tools (not darwin)");
    process.exit(0);
  }
  const zip = path.join(os.tmpdir(), "platform-tools-darwin.zip");
  console.log("downloading darwin platform-tools…");
  await download(URL, zip);
  const tmp = path.join(os.tmpdir(), "pt-darwin-" + Date.now());
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`unzip -o "${zip}" -d "${tmp}"`, { stdio: "inherit" });
  const src = fs.existsSync(path.join(tmp, "platform-tools"))
    ? path.join(tmp, "platform-tools")
    : tmp;
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.cpSync(src, DEST, { recursive: true });
  const adb = path.join(DEST, "adb");
  if (!fs.existsSync(adb)) throw new Error("darwin adb missing after unzip");
  fs.chmodSync(adb, 0o755);
  console.log("darwin platform-tools ready at", DEST);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
