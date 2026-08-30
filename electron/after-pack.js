const fs = require("fs");
const path = require("path");

function rm(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

function copyDeref(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries;
  try {
    entries = fs.readdirSync(src);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === ".env" || name.startsWith(".env.")) continue;
    if (/^debug-/.test(name) || /\.(bat|cmd)$/.test(name)) continue;
    if (name === "tests-tmp" || name === "repro.mjs") continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    let st;
    try {
      st = fs.statSync(s);
    } catch {
      continue;
    }
    if (st.isDirectory()) copyDeref(s, d);
    else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const res = path.join(context.appOutDir, "ProfManager.app", "Contents", "Resources");
  const srcStandalone = path.join(__dirname, "standalone-server");
  const destStandalone = path.join(res, "standalone-server");
  const srcNm = path.join(srcStandalone, "node_modules");
  const destNm = path.join(destStandalone, "node_modules");

  if (!fs.existsSync(path.join(srcStandalone, "server.js"))) {
    throw new Error("electron/standalone-server/server.js missing before pack");
  }
  if (!fs.existsSync(srcNm)) {
    throw new Error("electron/standalone-server/node_modules missing before pack");
  }

  // extraResources drops node_modules via default ignore / broken pnpm links.
  // Copy a real, dereferenced tree into the .app — same idea as the Windows flatten.
  console.log("[afterPack] copying dereferenced standalone-server into app");
  rm(destStandalone);
  copyDeref(srcStandalone, destStandalone);

  const adb = path.join(res, "platform-tools", "adb");
  if (fs.existsSync(adb)) {
    fs.chmodSync(adb, 0o755);
    try { fs.chmodSync(path.join(res, "platform-tools", "fastboot"), 0o755); } catch {}
  }

  if (!fs.existsSync(path.join(destStandalone, "server.js"))) {
    throw new Error("Mac package missing standalone-server/server.js after copy");
  }
  if (!fs.existsSync(destNm)) {
    throw new Error("Mac package missing standalone-server/node_modules after copy");
  }

  const appPath = path.join(context.appOutDir, "ProfManager.app");
  try {
    const { execSync } = require("child_process");
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
    console.log("[afterPack] ad-hoc codesign ok");
  } catch (e) {
    console.warn("[afterPack] ad-hoc codesign skipped: " + (e.message || e));
  }

  console.log("[afterPack] mac package ok standalone + node_modules + adb=" + fs.existsSync(adb));
};
