#!/usr/bin/env node
const { spawnSync } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");

const RUN_ID = process.argv[2] || process.env.MAC_RUN_ID;
if (!RUN_ID) {
  console.error("usage: node scripts/download-mac-run.js <runId>");
  process.exit(1);
}

const DIST = path.join(__dirname, "..", "electron", "dist");
const OWNER = "Amine9988";
const REPO = "profmanager";

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
    const u = new URL(url);
    const headers = {
      "User-Agent": "pm",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (u.hostname === "api.github.com") headers.Authorization = "Bearer " + token;
    https
      .get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          return get(next, dest, token).then(resolve, reject);
        }
        if (dest) {
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function unzip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Force -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}'`,
    ],
    { encoding: "utf8", windowsHide: true }
  );
  if (ps.status !== 0) throw new Error(ps.stderr || ps.stdout || "unzip failed");
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
  const tmp = path.join(DIST, "_mac-artifact");
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const arts = JSON.parse(
    (await get(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/artifacts`, null, token)).toString()
  );
  for (const art of arts.artifacts || []) {
    console.log("download", art.name, Math.round(art.size_in_bytes / 1048576) + "MB");
    const zip = path.join(DIST, "_a" + art.id + ".zip");
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
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
