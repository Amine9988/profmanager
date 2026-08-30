const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const crypto = require("crypto");

const FEED = "https://pub-a093dfe3d51241128f512f880dc36324.r2.dev/";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadHttps(url, dest) {
  return new Promise((resolve, reject) => {
    const go = (target, hops) => {
      if (hops > 8) return reject(new Error("Too many redirects"));
      const u = new URL(target);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          headers: { "User-Agent": "profmanager-mac-dist", Accept: "*/*" },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, target).href;
            return go(next, hops + 1);
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            return reject(new Error("HTTP " + res.statusCode + " " + url));
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const tmp = dest + ".part";
          const out = fs.createWriteStream(tmp);
          res.pipe(out);
          out.on("error", reject);
          out.on("finish", () => {
            out.close(() => {
              try {
                if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 20) {
                  try { fs.rmSync(tmp, { force: true }); } catch {}
                  return reject(new Error("empty download: " + url));
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
    go(url, 0);
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "profmanager-mac-dist" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " " + url));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

function headOk(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "HEAD",
        headers: { "User-Agent": "profmanager-mac-dist" },
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode,
          size: parseInt(res.headers["content-length"] || "0", 10) || 0,
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function unzip(zipPath, outDir) {
  if (!fs.existsSync(zipPath)) throw new Error("Zip missing: " + zipPath);
  const size = fs.statSync(zipPath).size;
  if (size < 22) throw new Error("Zip too small (" + size + "): " + zipPath);
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", outDir], {
    windowsHide: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function parseDmgNames(yml) {
  return [...String(yml).matchAll(/^\s*-?\s*url:\s*['"]?(.+?\.dmg)['"]?\s*$/gim)].map((m) =>
    path.basename(m[1].trim())
  );
}

function parseYmlMeta(yml) {
  const version = (String(yml).match(/^version:\s*['"]?([^\r\n'"#]+)/m) || [])[1];
  const files = [];
  const re = /url:\s*['"]?([^\r\n'"]+\.dmg)['"]?[\s\S]*?sha512:\s*([A-Za-z0-9+/=]+)[\s\S]*?size:\s*(\d+)/g;
  let m;
  const text = String(yml);
  while ((m = re.exec(text))) {
    files.push({
      url: path.basename(m[1].trim()),
      sha512: m[2].trim(),
      size: parseInt(m[3], 10),
    });
  }
  return { version: version ? version.trim() : null, files };
}

async function syncFromR2(dist) {
  fs.mkdirSync(dist, { recursive: true });
  const yml = await downloadText(FEED + "latest-mac.yml");
  fs.writeFileSync(path.join(dist, "latest-mac.yml"), yml);
  const names = parseDmgNames(yml);
  if (!names.length) throw new Error("latest-mac.yml has no DMG urls");
  const ready = [];
  for (const name of names) {
    const dest = path.join(dist, name);
    const meta = parseYmlMeta(yml).files.find((f) => f.url === name);
    if (fs.existsSync(dest) && meta && fs.statSync(dest).size === meta.size) {
      console.log("keep " + name + " (" + (meta.size / 1048576).toFixed(1) + " MB)");
      ready.push(dest);
      continue;
    }
    console.log("download " + name);
    await downloadHttps(FEED + encodeURI(name), dest);
    ready.push(dest);
  }
  return { yml, files: ready };
}

async function verifyMacRelease(dist, expectedVersion) {
  const errors = [];
  const yml = await downloadText(FEED + "latest-mac.yml");
  const meta = parseYmlMeta(yml);
  if (!meta.version) errors.push("latest-mac.yml missing version");
  if (expectedVersion && meta.version !== expectedVersion) {
    errors.push("R2 version " + meta.version + " != package " + expectedVersion);
  }
  if (meta.files.length < 2) errors.push("expected arm64 and x64 DMGs, got " + meta.files.length);
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "latest-mac.yml"), yml);

  for (const file of meta.files) {
    const url = FEED + encodeURI(file.url);
    const head = await headOk(url);
    if (head.status !== 200) errors.push(file.url + " HEAD " + head.status);
    if (head.size && file.size && head.size !== file.size) {
      errors.push(file.url + " size mismatch R2=" + head.size + " yml=" + file.size);
    }
    const local = path.join(dist, file.url);
    if (!fs.existsSync(local) || fs.statSync(local).size !== file.size) {
      console.log("repair " + file.url);
      await downloadHttps(url, local);
    }
    const size = fs.statSync(local).size;
    if (size !== file.size) errors.push(file.url + " local size " + size + " != " + file.size);
    const sha = crypto.createHash("sha512").update(fs.readFileSync(local)).digest("base64");
    if (sha !== file.sha512) errors.push(file.url + " sha512 mismatch");
    console.log("ok " + file.url + " " + (size / 1048576).toFixed(1) + " MB");
  }

  if (errors.length) {
    const err = new Error(errors.join("\n"));
    err.details = errors;
    throw err;
  }
  return meta;
}

function tempZipPath(id) {
  return path.join(os.tmpdir(), "pm-mac-artifact-" + id + ".zip");
}

module.exports = {
  FEED,
  sleep,
  downloadHttps,
  downloadText,
  headOk,
  unzip,
  parseDmgNames,
  parseYmlMeta,
  syncFromR2,
  verifyMacRelease,
  tempZipPath,
};
