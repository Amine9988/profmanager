const fs = require("fs");
const path = require("path");

function rm(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const res = path.join(context.appOutDir, "ProfManager.app", "Contents", "Resources");
  const standalone = path.join(res, "standalone-server");
  const serverJs = path.join(standalone, "server.js");
  const nm = path.join(standalone, "node_modules");

  rm(path.join(standalone, ".env"));
  rm(path.join(standalone, ".env.local"));
  rm(path.join(standalone, ".env.production"));
  for (const name of fs.existsSync(standalone) ? fs.readdirSync(standalone) : []) {
    if (/^debug-/.test(name) || /\.(bat|cmd)$/.test(name) || name === "tests-tmp" || name === "repro.mjs") {
      rm(path.join(standalone, name));
    }
  }

  const adb = path.join(res, "platform-tools", "adb");
  if (fs.existsSync(adb)) {
    fs.chmodSync(adb, 0o755);
    try { fs.chmodSync(path.join(res, "platform-tools", "fastboot"), 0o755); } catch {}
  }

  if (!fs.existsSync(serverJs)) {
    throw new Error("Mac package missing standalone-server/server.js");
  }
  if (!fs.existsSync(nm)) {
    throw new Error("Mac package missing standalone-server/node_modules — server will not start");
  }

  console.log("[afterPack] mac package ok standalone + node_modules + adb=" + fs.existsSync(adb));
};
