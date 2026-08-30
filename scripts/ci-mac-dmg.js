#!/usr/bin/env node
/**
 * Trigger GitHub Actions macOS DMG build, then put .dmg + latest-mac.yml in electron/dist.
 * If the GitHub artifact unzip fails (Windows path / Expand-Archive), fall back to R2.
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { createWriteStream } = require("fs");
const {
  sleep,
  unzip,
  syncFromR2,
  verifyMacRelease,
  tempZipPath,
} = require("./mac-dist-utils");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "electron", "dist");
const OWNER = "Amine9988";
const REPO = "profmanager";
const WORKFLOW = "build-mac.yml";
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "electron", "package.json"), "utf8")).version;

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

function api(method, apiPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          Accept: "application/vnd.github+json",
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
          if (res.statusCode === 204) return resolve({ status: 204, json: null });
          let json = null;
          try {
            json = JSON.parse(buf.toString("utf8") || "null");
          } catch {
            json = { message: buf.toString("utf8") };
          }
          if (res.statusCode >= 400) {
            const err = new Error((json && json.message) || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            return reject(err);
          }
          resolve({ status: res.statusCode, json });
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
        Accept: sendAuth ? "application/vnd.github+json" : "*/*",
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
            res.resume();
            return reject(new Error("Download failed " + res.statusCode));
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const tmp = dest + ".part";
          const out = createWriteStream(tmp);
          res.pipe(out);
          out.on("error", reject);
          out.on("finish", () => {
            out.close(() => {
              try {
                if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 22) {
                  try { fs.rmSync(tmp, { force: true }); } catch {}
                  return reject(new Error("empty artifact zip"));
                }
                fs.renameSync(tmp, dest);
                resolve(dest);
              } catch (e) {
                reject(e);
              }
            });
          });
        }
      );
      req.on("error", reject);
      req.end();
    };
    go(url, 0, true);
  });
}

async function downloadArtifacts(token, runId) {
  const arts = await api("GET", `/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`, { token });
  const list = arts.json.artifacts || [];
  if (!list.length) throw new Error("No artifacts on the Mac build");
  fs.mkdirSync(DIST, { recursive: true });
  const tmpDir = path.join(osTmpUnique(), "pm-mac-unpack");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const zips = [];
  try {
    for (const art of list) {
      console.log(`Downloading artifact ${art.name} (${Math.round(art.size_in_bytes / 1048576)} MB)…`);
      const tmpZip = tempZipPath(art.id);
      zips.push(tmpZip);
      await followDownload(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${art.id}/zip`,
        token,
        tmpZip
      );
      console.log("unzip " + path.basename(tmpZip) + " (" + (fs.statSync(tmpZip).size / 1048576).toFixed(1) + " MB)");
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
      throw new Error("No .dmg in the Mac artifact (zip-only build)");
    }
    for (const dmg of dmgs) {
      const dest = path.join(DIST, path.basename(dmg));
      fs.copyFileSync(dmg, dest);
      console.log(`READY ${dest} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
    }
    for (const f of found) {
      if (/\.(yml)$/i.test(f)) {
        fs.copyFileSync(f, path.join(DIST, path.basename(f)));
      }
    }
  } finally {
    for (const z of zips) {
      try { fs.rmSync(z, { force: true }); } catch {}
      try { fs.rmSync(z + ".part", { force: true }); } catch {}
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function osTmpUnique() {
  return require("os").tmpdir();
}

(async () => {
  if (process.env.MAC_FROM_R2 === "1") {
    console.log("Syncing Mac release from R2 (no CI dispatch)");
    await syncFromR2(DIST);
    const meta = await verifyMacRelease(DIST, VERSION);
    console.log("OK Mac release v" + meta.version + " in electron/dist");
    return;
  }

  const { token } = gitCredential();
  console.log("GitHub auth: ok (token not shown)");

  const ref = process.env.MAC_BUILD_REF || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim() || "master";
  console.log("Dispatching Build Mac (native arm64 + intel) ref=" + ref);
  await api("POST", `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    token,
    body: { ref },
  });
  const started = Date.now();
  let runId = null;
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

  for (;;) {
    const info = await api("GET", `/repos/${OWNER}/${REPO}/actions/runs/${runId}`, { token });
    const st = info.json.status;
    const concl = info.json.conclusion;
    console.log(`Build Mac: ${st}${concl ? " / " + concl : ""}`);
    if (st === "completed") {
      if (concl !== "success") {
        console.log("workflow conclusion=" + concl + " — will still try artifacts then R2");
      }
      break;
    }
    await sleep(20000);
  }

  try {
    await downloadArtifacts(token, runId);
  } catch (e) {
    console.log("artifact copy failed (" + (e.message || e) + ") — falling back to R2");
    await syncFromR2(DIST);
  }

  const meta = await verifyMacRelease(DIST, VERSION);
  console.log("Done. Apple setup v" + meta.version + " is in electron/dist");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
