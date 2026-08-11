import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import http from "http";

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.env.PORT || 3456);
const TOOL_DIR = path.join(os.homedir(), "AppData", "Local", "ProfManager-Tunnel");
const CLOUDFLARED = path.join(TOOL_DIR, "cloudflared.exe");

const SERVER_DIR = path.join(ROOT, "electron", "dist", "win-unpacked", "resources", "standalone-server");
const TRIAL_DIR = path.join(os.homedir(), "AppData", "Local", "ProfManager-Browser");
const TRIAL_DB = path.join(TRIAL_DIR, "profmanager.db");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitPortFree(port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const probe = () => {
      const sock = http.get({ host: "127.0.0.1", port, path: "/" });
      sock.once("response", (res) => { res.resume(); if (Date.now() - start < timeoutMs) setTimeout(probe, 300); else resolve(false); });
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

function startBrowserServer() {
  fs.mkdirSync(TRIAL_DIR, { recursive: true });
  const child = spawn("node", [path.join(SERVER_DIR, "server.js")], {
    cwd: SERVER_DIR,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), HOSTNAME: "0.0.0.0", LOCAL_DB_PATH: TRIAL_DB },
    stdio: "ignore",
    windowsHide: true,
  });
  return child;
}

async function main() {
  console.log(`[public] نسخة المتصفح على المنفذ ${PORT}...`);

  // Free the port first.
  const used = await waitPortFree(PORT);
  if (!used) {
    console.log(`[public] يوجد خادم يعمل على ${PORT} — سنستخدمه.`);
  } else {
    console.log(`[public] تشغيل نسخة المتصفح محلياً...`);
    startBrowserServer();
  }

  if (!(await waitHttpReady(`http://127.0.0.1:${PORT}/api/scan/info`))) {
    console.error(`[public] الخادم المحلي لم يبدأ على ${PORT}.`);
    process.exit(1);
  }
  console.log(`[public] الخادم المحلي جاهز: http://localhost:${PORT}`);

  if (!fs.existsSync(CLOUDFLARED)) {
    console.log("[public] تحميل cloudflared لأول مرة...");
    const { execSync } = await import("child_process");
    fs.mkdirSync(TOOL_DIR, { recursive: true });
    execSync(
      `powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '${CLOUDFLARED}' -UseBasicParsing"`,
      { stdio: "ignore", timeout: 180000 }
    );
  }

  console.log("[public] إنشاء النفق العام عبر Cloudflare...");
  const child = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let buf = "";
  child.stdout.on("data", (d) => { buf += d.toString(); });
  child.stderr.on("data", (d) => { buf += d.toString(); });
  child.on("exit", (code) => { console.log(`[public] cloudflared exited (${code}).`); process.exit(0); });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      console.log(`\n===================================================`);
      console.log(`  نسخة المتصفح تعمل على كل الأجهزة عبر الإنترنت`);
      console.log(`  🌍  ${m[0]}`);
      console.log(`  أرسل هذا الرابط لأي جهاز في أي مكان.`);
      console.log(`===================================================\n`);
      console.log(`  خادم محلي: http://localhost:${PORT}`);
      console.log(`  إيقاف: أغلق هذه النافذة\n`);
      await sleep(3000);
      try {
        const res = await fetch(m[0] + "/overview", { signal: AbortSignal.timeout(25000) });
        console.log(`[public] فحص الرابط: HTTP ${res.status} ✓`);
      } catch (e) {
        console.log(`[public] أول وصول قد يستغرق ثوانٍ: ${e.message}`);
      }
      break;
    }
    await sleep(1000);
  }
  if (!buf.includes("trycloudflare.com")) {
    console.error("[public] لم يظهر الرابط العام خلال 60 ثانية.");
  }
}

main().catch((e) => {
  console.error("[public] error:", e.message);
  process.exit(1);
});
