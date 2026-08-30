#!/usr/bin/env node
const { spawnSync } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { createWriteStream } = require("fs");
const { unzip, tempZipPath, verifyMacRelease, syncFromR2 } = require("./mac-dist-utils");

const RUN_ID = process.argv[2] || process.env.MAC_RUN_ID;
if (!RUN_ID) {
  console.error("usage: node scripts/download-mac-run.js <runId>");
  process.exit(1);
}

const DIST = path.join(__dirname, "..", "electron", "dist");
const OWNER = "Amine9988";
const REPO = "profmanager";
const VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "electron", "package.json"), "utf8")
).version;

function gitCredential() {
  const r = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    windowsHide: true,
  });
  const map = {};
  for (const line of r.stdout.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  }
  return map.password;
}

function get(url, dest, token) {
  return new Promise((resolve, reject) => {
    const go = (target, hops, sendAuth) => {
      if (hops > 8) return reject(new Error("Too many redirects"));
      const u = new URL(target);
      const headers = {
        "User-Agent": "pm",
        Accept: dest ? "application/octet-stream" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (sendAuth && u.hostname === "api.github.com") headers.Authorization = "Bearer " + token;
      https
        .get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, target).href;
            return go(next, hops + 1, false);
          }
          if (dest) {
            if (res.statusCode >= 400) {
              res.resume();
              return reject(new Error("HTTP " + res.statusCode));
            }
            const tmp = dest + ".part";
            const out = createWriteStream(tmp);
            res.pipe(out);
            out.on("error", reject);
            out.on("finish", () => {
              out.close(() => {
                try {
                  if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 22) {
                    try { fs.rmSync(tmp, { force: true }); } catch {}
                    return reject(new Error("empty download"));
                  }
                  fs.renameSync(tmp, dest);
                  resolve();
                } catch (e) {
                  reject(e);
                }
              });
            });
            return;
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        })
        .on("error", reject);
    };
    go(url, 0, true);
  });
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

(async () => {
  const token = gitCredential();
  fs.mkdirSync(DIST, { recursive: true });
  const tmp = path.join(require("os").tmpdir(), "pm-mac-unpack-" + RUN_ID);
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const arts = JSON.parse(
      (await get(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/artifacts`, null, token)).toString()
    );
    for (const art of arts.artifacts || []) {
      console.log("download", art.name, Math.round(art.size_in_bytes / 1048576) + "MB");
      const zip = tempZipPath(art.id);
      await get(`https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${art.id}/zip`, zip, token);
      unzip(zip, tmp);
      fs.rmSync(zip, { force: true });
    }
    for (const f of walk(tmp)) {
      if (!/\.(dmg|yml|blockmap)$/i.test(f)) continue;
      const dest = path.join(DIST, path.basename(f));
      fs.copyFileSync(f, dest);
      console.log("READY", dest, (fs.statSync(dest).size / 1048576).toFixed(1) + "MB");
    }
  } catch (e) {
    console.log("artifact copy failed (" + (e.message || e) + ") — falling back to R2");
    await syncFromR2(DIST);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  const meta = await verifyMacRelease(DIST, VERSION);
  console.log("OK v" + meta.version);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
