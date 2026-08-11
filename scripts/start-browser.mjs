import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import http from "http";
import net from "net";
const ROOT = path.resolve(process.cwd());
// Use the packaged standalone server (fully resolved, self-contained node_modules)
// rather than electron/standalone-server which keeps the pnpm junction layout.
const SERVER_DIR =
  process.env.STANDALONE_DIR ||
  path.join(ROOT, "electron", "dist", "win-unpacked", "resources", "standalone-server");
const SERVER_JS = path.join(SERVER_DIR, "server.js");
const PORT = Number(process.env.PORT || 3456);

const TRIAL_DIR = path.join(os.homedir(), "AppData", "Local", "ProfManager-Browser");
const TRIAL_DB = path.join(TRIAL_DIR, "profmanager.db");
const SOURCE_DB = path.join(ROOT, "profmanager.db");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killByCommandLine(match, label) {
  try {
    const script = `
      Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match '${match}' -and $_.ProcessId -ne ${process.pid} } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    `;
    execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
      stdio: "ignore",
      timeout: 10000,
    });
    console.log(`[browser-trial] killed other ${label} processes`);
  } catch {}
}

function killPortOwner(port) {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore", timeout: 8000 }
    );
  } catch {}
}

function waitPortFree(port, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const probe = () => {
      const sock = net.connect({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        sock.destroy();
        if (Date.now() - start < timeoutMs) setTimeout(probe, 300);
        else resolve(false);
      });
      sock.once("error", () => resolve(true));
    };
    probe();
  });
}

function waitHttpReady(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      const req = http.get(url, (res) => { res.resume(); resolve(true); });
      req.on("error", () => setTimeout(check, 1200));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 1200); });
    };
    check();
  });
}

// Ensure single trial instance on the port.
console.log(`[browser-trial] ensuring single instance on port ${PORT}...`);
killByCommandLine("start-browser", "browser-trial instances");
killPortOwner(PORT);
await sleep(1000);
if (!(await waitPortFree(PORT))) {
  console.error(`[browser-trial] Port ${PORT} still busy — aborting.`);
  process.exit(1);
}

// Trial database: a dedicated copy so the desktop app data is untouched.
fs.mkdirSync(TRIAL_DIR, { recursive: true });
if (!fs.existsSync(TRIAL_DB) && fs.existsSync(SOURCE_DB)) {
  fs.copyFileSync(SOURCE_DB, TRIAL_DB);
  console.log(`[browser-trial] seeded trial DB from ${SOURCE_DB}`);
}

console.log(`[browser-trial] starting standalone server (node, no Electron)...`);
const child = spawn("node", [SERVER_JS], {
  cwd: SERVER_DIR,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "0.0.0.0",
    LOCAL_DB_PATH: TRIAL_DB,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

child.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
child.on("exit", (code, signal) => {
  console.log(`[browser-trial] server exited (code=${code}, signal=${signal})`);
  process.exit(0);
});

const ready = await waitHttpReady(`http://127.0.0.1:${PORT}/api/scan/info`);
if (ready) {
  console.log(`\n[browser-trial] READY — نسخة تجريبية في المتصفح`);
  console.log(`  http://localhost:${PORT}`);
  const lan = os.networkInterfaces();
  for (const name of Object.keys(lan)) {
    for (const a of lan[name] || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  LAN (هاتفك): http://${a.address}:${PORT}`);
    }
  }
  console.log(`  قاعدة البيانات التجريبية: ${TRIAL_DB}`);
  try { execSync(`start "" "http://localhost:${PORT}"`); console.log("[browser-trial] browser opened"); } catch {}
} else {
  console.error("[browser-trial] server did not become ready.");
  process.exit(1);
}
