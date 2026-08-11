import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import http from "http";

const ROOT = path.resolve(process.cwd());
const TOOL_DIR = path.join(os.homedir(), "AppData", "Local", "ProfManager-Tunnel");
const CLOUDFLARED = path.join(TOOL_DIR, "cloudflared.exe");
const TUNNEL_URL = process.env.TUNNEL_URL || "http://localhost:3456";
const DOWNLOAD_URL =
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function downloadCloudflared() {
  fs.mkdirSync(TOOL_DIR, { recursive: true });
  console.log("[tunnel] downloading cloudflared...");
  execSync(`powershell -NoProfile -Command "Invoke-WebRequest -Uri '${DOWNLOAD_URL}' -OutFile '${CLOUDFLARED}' -UseBasicParsing"`, { stdio: "ignore", timeout: 180000 });
  if (!fs.existsSync(CLOUDFLARED)) throw new Error("cloudflared download failed");
  console.log("[tunnel] cloudflared ready");
}

function ensureTunnelReady() {
  // Give the browser trial a moment to be up.
  const url = new URL(TUNNEL_URL);
  return new Promise((resolve) => {
    const req = http.get({ host: url.hostname, port: url.port || 80, path: "/api/scan/info" }, (res) => { res.resume(); resolve(true); });
    req.on("error", () => setTimeout(() => { try { http.get({ host: url.hostname, port: url.port || 80, path: "/api/scan/info" }, (res) => { res.resume(); resolve(true); }).on("error", () => resolve(false)); } catch { resolve(false); } }, 2000));
  });
}

async function main() {
  if (!fs.existsSync(CLOUDFLARED)) downloadCloudflared();

  const upstreamUp = await ensureTunnelReady();
  if (!upstreamUp) {
    console.error(`[tunnel] The local server at ${TUNNEL_URL} is not responding.`);
    console.error("         Start the browser trial first:  npm run browser  (or start-browser.cmd)");
    process.exit(1);
  }
  console.log(`[tunnel] local server OK at ${TUNNEL_URL}`);

  const child = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", TUNNEL_URL], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    process.stdout.write(`[cloudflared] ${d}`);
  });
  child.stderr.on("data", (d) => {
    buf += d.toString();
    process.stderr.write(`[cloudflared] ${d}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[tunnel] cloudflared exited (code=${code}, signal=${signal})`);
    process.exit(0);
  });

  // Print the public URL once it appears.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      console.log(`\n[tunnel] READY — نسخة المتصفح تعمل على كل الأجهزة عبر الإنترنت`);
      console.log(`   🌍  ${m[0]}`);
      console.log(`   أرسل هذا الرابط لأي جهاز في أي مكان.\n`);
      // Also verify public reachability.
      await sleep(3000);
      try {
        const res = await fetch(m[0] + "/overview", { signal: AbortSignal.timeout(25000) });
        console.log(`[tunnel] public check: HTTP ${res.status} ✓`);
      } catch (e) {
        console.log(`[tunnel] public check failed (يستغرق أول وصول ثوانٍ): ${e.message}`);
      }
      break;
    }
    await sleep(1000);
  }
  if (!buf.includes("trycloudflare.com")) {
    console.error("[tunnel] لم يظهر الرابط العام خلال 60 ثانية — راجع السجل أعلاه.");
  }
}

main().catch((e) => {
  console.error("[tunnel] error:", e.message);
  process.exit(1);
});
