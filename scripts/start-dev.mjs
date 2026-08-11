import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import net from "net";

const ROOT = path.resolve(process.cwd());
const PORT = process.env.PORT || "3456";
const PORT_NUM = Number(PORT);
const isWindows = process.platform === "win32";

let stopping = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1) Single-instance + port cleanup. Ensures no other copy of this script,
//    no orphaned `next dev` and no stale listener can fight over the port.
// ---------------------------------------------------------------------------
function killByCommandLine(match, label) {
  if (!isWindows) return;
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
    console.log(`[start-dev] killed other ${label} processes`);
  } catch {
    /* nothing to kill */
  }
}

function killPortOwner(port) {
  try {
    if (isWindows) {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore", timeout: 8000 }
      );
    } else {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore", timeout: 8000 });
    }
  } catch {
    /* nothing to kill */
  }
}

function waitPortFree(port, timeoutMs = 15000) {
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

async function waitHttpReady(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1500);
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2) Cleanup pass.
// ---------------------------------------------------------------------------
console.log(`[start-dev] Ensuring single instance on port ${PORT}...`);
killByCommandLine("start-dev", "start-dev instances");
killByCommandLine("next.*dev", "next dev instances");
killPortOwner(PORT);
await sleep(1000);
const free = await waitPortFree(PORT_NUM);
if (!free) {
  console.error(`[start-dev] Port ${PORT} is still in use — aborting. Kill it manually and retry.`);
  process.exit(1);
}
console.log(`[start-dev] Port ${PORT} is free — starting clean server.`);

// ---------------------------------------------------------------------------
// 2b) Best-effort firewall rule so the phone can reach the PC on any network
//     profile (incl. Public). Harmless if it fails (no admin).
// ---------------------------------------------------------------------------
if (isWindows) {
  try {
    execSync(
      `netsh advfirewall firewall add rule name="ProfManager Dev ${PORT}" dir=in action=allow protocol=TCP localport=${PORT} profile=any`,
      { stdio: "ignore", timeout: 8000 }
    );
    console.log(`[firewall] Port ${PORT} allowed on all profiles (phone/LAN access).`);
  } catch {
    /* no admin — rule may already exist */
  }
}

// ---------------------------------------------------------------------------
// 3) adb reverse loop so a phone over USB reaches the same port.
// ---------------------------------------------------------------------------
function findAdb() {
  const bundled = path.join(ROOT, "electron", "platform-tools", "adb.exe");
  if (fs.existsSync(bundled)) return bundled;
  return "adb";
}

const adb = findAdb();

function adbReverseLoop() {
  const tick = () => {
    if (stopping) return;
    const child = spawn(adb, ["reverse", `tcp:${PORT}`, `tcp:${PORT}`], { stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.on("exit", () => setTimeout(tick, 4000));
  };
  tick();
}

adbReverseLoop();
console.log(`[usb-bridge] adb reverse tcp:${PORT} -> tcp:${PORT} (${adb}) — phone via USB, no Wi-Fi needed`);

// ---------------------------------------------------------------------------
// 4) Shared database: same file the packaged Electron app uses.
// ---------------------------------------------------------------------------
const SHARED_DB =
  process.env.LOCAL_DB_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "profmanager-desktop", "profmanager.db");
fs.mkdirSync(path.dirname(SHARED_DB), { recursive: true });

// ---------------------------------------------------------------------------
// 5) Start `next dev`. On an unexpected exit: clean the port again, then
//    restart (bounded retries so we never spin forever on a real conflict).
// ---------------------------------------------------------------------------
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
let consecutiveFailures = 0;

async function startNext() {
  const child = spawn(
    "node",
    [nextBin, "dev", "--hostname", "0.0.0.0", "--port", PORT],
    {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, LOCAL_DB_PATH: SHARED_DB },
    }
  );

  child.on("exit", async (code, signal) => {
    if (stopping) process.exit(0);
    console.error(`\n[start-dev] next dev exited (code=${code}, signal=${signal})`);
    consecutiveFailures += 1;
    if (consecutiveFailures > 5) {
      console.error(`[start-dev] Restarted 5 times in a row — giving up. Fix the blocker, then run: npm run dev`);
      process.exit(1);
    }
    // Clean the port again so a stale process can never keep us in a crash loop.
    killPortOwner(PORT);
    await sleep(2000);
    const isFree = await waitPortFree(PORT_NUM, 8000);
    if (!isFree) {
      console.error(`[start-dev] Port ${PORT} still busy after cleanup — giving up.`);
      process.exit(1);
    }
    console.log(`[start-dev] restarting in 2s... (attempt ${consecutiveFailures})`);
    await sleep(2000);
    startNext();
  });

  return child;
}

const child = await startNext();

process.on("SIGINT", () => {
  stopping = true;
  child.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopping = true;
  child.kill("SIGTERM");
  process.exit(0);
});

// ---------------------------------------------------------------------------
// 6) Readiness report.
// ---------------------------------------------------------------------------
(async () => {
  const ready = await waitHttpReady(`http://127.0.0.1:${PORT}/api/scan/info`);
  if (ready) {
    consecutiveFailures = 0;
    console.log(`\n[start-dev] READY — open http://localhost:${PORT} in your browser`);
  } else {
    console.error(`\n[start-dev] Server did not become ready within the timeout — check the logs above.`);
  }
})();
