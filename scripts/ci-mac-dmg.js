#!/usr/bin/env node
/**
 * Trigger GitHub Actions macOS DMG build and copy only .dmg files into electron/dist.
 * Never prints credentials.
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { pipeline } = require("stream/promises");
const { createWriteStream, createReadStream } = require("fs");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "electron", "dist");
const OWNER = "Amine9988";
const REPO = "profmanager";
const WORKFLOW = "build-mac.yml";

function gitCredential() {
  const r = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) {
    throw new Error("GitHub credentials not available in Git Credential Manager");
  }
  const map = {};
  for (const line of r.stdout.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  }
  const token = map.password || map.token;
  if (!token) throw new Error("No GitHub token in git credentials");
  return { user: map.username || "x-access-token", token };
}

function api(method, apiPath, { token, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          Accept: raw ? "application/octet-stream" : "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "profmanager-mac-dmg",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode === 204) return resolve({ status: 204, json: null, headers: res.headers });
          let json = null;
          if (!raw) {
            try {
              json = JSON.parse(buf.toString("utf8") || "null");
            } catch {
              json = { message: buf.toString("utf8") };
            }
          }
          if (res.statusCode >= 400) {
            const msg = (json && json.message) || buf.toString("utf8") || `HTTP ${res.statusCode}`;
            const err = new Error(msg);
            err.status = res.statusCode;
            return reject(err);
          }
          resolve({ status: res.statusCode, json, headers: res.headers, buf });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function followDownload(url, token, dest) {
  return new Promise((resolve, reject) => {
    const go = (target, hops, sendAuth) => {
      if (hops > 8) return reject(new Error("Too many redirects"));
      const u = new URL(target);
      const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "profmanager-mac-dmg",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (sendAuth) headers.Authorization = `Bearer ${token}`;
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          headers,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = res.headers.location.startsWith("http")
              ? res.headers.location
              : `${u.protocol}//${u.host}${res.headers.location}`;
            return go(next, hops + 1, false);
          }
          if (res.statusCode >= 400) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => reject(new Error(`Download failed ${res.statusCode}`)));
            return;
          }
          const out = createWriteStream(dest);
          res.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
        }
      );
      req.on("error", reject);
      req.end();
    };
    go(url, 0, true);
  });
}

function unzip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const ps = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}'`],
    { encoding: "utf8", windowsHide: true }
  );
  if (ps.status !== 0) {
    throw new Error(ps.stderr || ps.stdout || "Expand-Archive failed");
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const { token } = gitCredential();
  console.log("GitHub auth: ok (token not shown)");

  let runId = null;
  let reuse = false;
  {
    const ref = process.env.MAC_BUILD_REF || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim() || "master";
    console.log("Dispatching Build Mac (native arm64 + intel) ref=" + ref);
    await api("POST", `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      token,
      body: { ref },
    });
    const started = Date.now();
    for (let i = 0; i < 30; i++) {
      await sleep(4000);
      const runs = await api("GET", `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=5`, { token });
      const run = (runs.json.workflow_runs || []).find((r) => new Date(r.created_at).getTime() >= started - 15000);
      if (run) {
        runId = run.id;
        console.log(`Run ${runId} status=${run.status}`);
        break;
      }
    }
    if (!runId) throw new Error("Could not find the dispatched workflow run");
  }

  if (!reuse) {
    for (;;) {
      const info = await api("GET", `/repos/${OWNER}/${REPO}/actions/runs/${runId}`, { token });
      const st = info.json.status;
      const concl = info.json.conclusion;
      console.log(`Build Mac: ${st}${concl ? " / " + concl : ""}`);
      if (st === "completed") {
        if (concl !== "success") throw new Error(`Mac build failed: ${concl}`);
        break;
      }
      await sleep(20000);
    }
  }

  const arts = await api("GET", `/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`, { token });
  const list = arts.json.artifacts || [];
  if (!list.length) throw new Error("No artifacts on the Mac build");
  fs.mkdirSync(DIST, { recursive: true });
  const tmpDir = path.join(DIST, "_mac-artifact");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  for (const art of list) {
    console.log(`Downloading artifact ${art.name} (${Math.round(art.size_in_bytes / 1048576)} MB)…`);
    const tmpZip = path.join(DIST, `_mac-artifact-${art.id}.zip`);
    await followDownload(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${art.id}/zip`,
      token,
      tmpZip
    );
    unzip(tmpZip, tmpDir);
    fs.rmSync(tmpZip, { force: true });
  }

  const found = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else found.push(p);
    }
  }
  walk(tmpDir);

  const dmgs = found.filter((f) => f.toLowerCase().endsWith(".dmg"));
  if (!dmgs.length) {
    console.error("Artifact files:", found.map((f) => path.basename(f)).join(", "));
    throw new Error("No .dmg in the Mac artifact (zip-only build)");
  }
  for (const dmg of dmgs) {
    const dest = path.join(DIST, path.basename(dmg));
    fs.copyFileSync(dmg, dest);
    const mb = (fs.statSync(dest).size / 1048576).toFixed(1);
    console.log(`READY ${dest} (${mb} MB)`);
  }
  for (const f of fs.readdirSync(DIST)) {
    if (f.endsWith(".zip") || f.endsWith(".zip.blockmap")) {
      if (f === "_mac-artifact.zip") continue;
      fs.unlinkSync(path.join(DIST, f));
      console.log(`removed ${f}`);
    }
  }
  fs.rmSync(tmpZip, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Done. Apple setup files are in electron/dist (dmg only).");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
