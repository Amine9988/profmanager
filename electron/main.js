const { app, BrowserWindow, Tray, Menu, nativeImage, Notification } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");

const LOG = path.join(os.tmpdir(), "pmanager-debug.log");
function log(m) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + " " + m + "\n"); } catch {}
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

function addFirewallRule(port) {
  const exe = process.execPath;
  const name = "ProfManager LAN Scan";
  try {
    execSync(`netsh advfirewall firewall delete rule name="${name}"`, { stdio: "ignore", timeout: 5000 });
  } catch {}
  try {
    execSync(
      `netsh advfirewall firewall add rule name="${name}" dir=in action=allow program="${exe}" protocol=TCP localport=${port} profile=private,domain`,
      { stdio: "ignore", timeout: 8000 }
    );
    log("firewall rule added for " + exe + " port " + port);
    return true;
  } catch (e) {
    log("firewall rule failed (need admin): " + e.message);
    return false;
  }
}

function findAdb() {
  const candidates = [
    path.join(process.resourcesPath || __dirname, "platform-tools", "adb.exe"),
    path.join(__dirname, "platform-tools", "adb.exe"),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// USB scanning via Android ADB reverse: makes the phone's localhost:PORT point to
// this computer's localhost:PORT. Works fully offline (USB cable + USB debugging).
function startAdbReverse(port) {
  const adb = findAdb();
  if (!adb) { log("adb not found, USB scan disabled"); return; }
  log("adb found: " + adb);
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    try {
      execSync(`"${adb}" reverse tcp:${port} tcp:${port}`, { stdio: "ignore", timeout: 6000 });
      log("adb reverse ok port " + port);
    } catch (e) {
      log("adb reverse not ready: " + (e.message || "").slice(0, 120));
    }
    setTimeout(loop, 4000);
  };
  loop();
  return { stop: () => { stopped = true; } };
}

let mainWindow;
let serverChild = null;
let tray = null;
let isQuitting = false;
let trayNotified = false;
let currentPort = 3001;
let serverOwned = false;

// No single-instance lock gate: it silently quits instead of showing a window
// when a previous instance runs elevated (UAC mismatch). Instead every launch
// attaches to (or starts) the real server, guaranteeing a window opens.

function killServer() {
  if (!serverChild) return;
  try {
    const pid = serverChild.pid;
    log("killing server child process pid=" + pid);
    serverChild.removeAllListeners("exit");
    execSync("taskkill /PID " + pid + " /T /F", {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch (e) {
    try { serverChild.kill(); } catch {}
  }
  serverChild = null;
}

app.on("before-quit", () => {
  log("before-quit: killing server");
  isQuitting = true;
  killServer();
});

app.on("will-quit", () => {
  log("will-quit: killing server");
  isQuitting = true;
  killServer();
});

function resolveIcon() {
  for (const p of [
    path.join(__dirname, "public", "icon.ico"),
    path.join(process.resourcesPath, "app", "public", "icon.ico"),
  ]) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

function detectPortFromOutput(data) {
  const m = data.toString().match(/Local:\s*http:\/\/127\.0\.0\.1:(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:" + port + "/", (res) => {
      res.resume();
      resolve(false); // something answered → in use
    });
    req.on("error", (e) => {
      // ECONNREFUSED/EADDRNOTAVAIL = free; socket hang up = occupied but broken → skip
      resolve(e.code === "ECONNREFUSED" || e.code === "EADDRNOTAVAIL");
    });
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}

function pollServer(port, timeoutMs, shouldAbort) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let lastErr = "";
    function check() {
      const abort = shouldAbort ? shouldAbort() : null;
      if (abort) return reject(new Error(abort));
      if (Date.now() > deadline) return reject(new Error("poll timeout (" + timeoutMs + "ms) lastErr=" + lastErr.slice(-200)));
      const req = http.get("http://127.0.0.1:" + port + "/", (res) => {
        res.resume();
        resolve(port);
      });
      req.on("error", (e) => { lastErr = e.message; setTimeout(check, 400); });
      req.setTimeout(2000, () => { lastErr = "timeout"; req.destroy(); setTimeout(check, 400); });
    }
    check();
  });
}

function resolveDbPath(standaloneDir) {
  const dir = app.getPath("userData");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const dest = path.join(dir, "profmanager.db");
  if (!fs.existsSync(dest)) {
    const bundled = path.join(standaloneDir, "profmanager.db");
    if (fs.existsSync(bundled)) {
      try {
        fs.copyFileSync(bundled, dest);
        log("migrated bundled DB to " + dest);
      } catch (e) { log("DB migrate failed: " + e.message); }
    }
  }
  log("db path = " + dest);
  return dest;
}

function spawnServer(standaloneDir, port) {
  const serverJs = path.join(standaloneDir, "server.js");
  if (!fs.existsSync(serverJs)) throw new Error("server.js not found in " + standaloneDir);

  log("spawning server port=" + port);
  const child = spawn(process.execPath, [serverJs], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      LOCAL_DB_PATH: resolveDbPath(standaloneDir),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverChild = child;

  let stderrBuf = "";
  let exited = false;
  child.stderr.on("data", (d) => { const s = d.toString(); stderrBuf += s; log("stderr: " + s.trim()); });
  child.stdout.on("data", (d) => log("stdout: " + d.toString().trim()));
  child.on("exit", (code, signal) => {
    exited = true;
    log("server exit code=" + code + " signal=" + signal + " stderr=" + stderrBuf.slice(-2000));
    if (serverChild === child) serverChild = null;
  });
  child.on("error", (err) => {
    exited = true;
    log("server spawn error=" + err.message);
    if (serverChild === child) serverChild = null;
  });

  return new Promise((resolve, reject) => {
    const abort = () => {
      if (exited) return "server exited before ready (code/stderr=" + stderrBuf.slice(0, 400) + ")";
      if (/EADDRINUSE/i.test(stderrBuf)) return "port " + port + " already in use: " + stderrBuf.slice(0, 300);
      return null;
    };
    pollServer(port, 90000, abort).then(
      (p) => resolve({ port: p, child }),
      (err) => reject(new Error(err.message + (stderrBuf ? " | server: " + stderrBuf.slice(0, 500) : "")))
    );
  });
}

async function startServer(standaloneDir) {
  // If a ProfManager server is already serving on one of our ports, attach to
  // it instead of spawning a duplicate so any double-click always opens a window.
  for (const port of [3001, 3002, 3003, 3004, 3005]) {
    if (!(await isPortFree(port))) {
      log("attaching to existing server on port " + port);
      return { port, child: null };
    }
  }
  let lastErr = "";
  for (const port of [3001, 3002, 3003, 3004, 3005]) {
    log("trying port " + port);
    try {
      if (await isPortFree(port)) {
        const r = await spawnServer(standaloneDir, port);
        log("server ready on port " + port);
        return r;
      }
      log("port " + port + " already in use, trying next");
    } catch (e) {
      lastErr = e.message;
      log("port " + port + " failed: " + e.message);
      killServer();
    }
  }
  throw new Error("Server failed: no free port 3001-3005. " + (lastErr || ""));
}

function setupTray(port) {
  if (tray) return;
  const iconPath = resolveIcon();
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip("ProfManager — http://localhost:" + port);
  const menu = Menu.buildFromTemplate([
    {
      label: "فتح ProfManager",
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    { type: "separator" },
    {
      label: "إنهاء ProfManager (يوقف الخادم)",
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

app.whenReady().then(async () => {
  log("ready");

  const STANDALONE_DIR = path.join(process.resourcesPath || __dirname, "standalone-server");
  log("standalone=" + STANDALONE_DIR);
  log("server exists=" + fs.existsSync(path.join(STANDALONE_DIR, "server.js")));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    icon: resolveIcon(),
    title: "ProfManager",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("close", (e) => {
    log("window close event (isQuitting=" + isQuitting + " serverOwned=" + serverOwned + ")");
    if (!isQuitting && serverOwned) {
      e.preventDefault();
      mainWindow.hide();
      log("minimized to tray, server stays running on port " + currentPort);
      if (!trayNotified) {
        trayNotified = true;
        try {
          new Notification({
            title: "ProfManager",
            body: "التطبيق ما زال يعمل في الخلفية.\nالخادم: http://localhost:" + currentPort + " — ارجع من أيقونة النظام.",
          }).show();
        } catch {}
      }
    } else {
      isQuitting = true;
      killServer();
    }
  });

  try {
    const { port, child } = await startServer(STANDALONE_DIR);
    currentPort = port;
    const ownsServer = !!child;
    serverOwned = ownsServer;

    const lanIp = getLanIp();
    if (lanIp && ownsServer) {
      const ok = addFirewallRule(port);
      log("scan address: http://" + lanIp + ":" + port + "  firewall=" + ok);
      mainWindow.setTitle("ProfManager — scan: http://" + lanIp + ":" + port);
    } else {
      log("no LAN IP found (offline) or attached to existing server");
    }

    if (ownsServer) {
      // USB scan (cable): phone scans cards, result shows on this computer.
      startAdbReverse(port);
      setupTray(port);
    } else {
      log("attached mode: window only, tray/adb handled by owning instance");
    }

    log("loading http://127.0.0.1:" + port + "/overview");
    mainWindow.loadURL("http://127.0.0.1:" + port + "/overview");
    mainWindow.once("ready-to-show", () => { log("window displayed"); mainWindow.show(); });
  } catch (err) {
    log("ERR=" + (err.stack || err.message));
    const logPath = LOG.replace(/\\/g, "/");
    const detail = (err.message || "Erreur inconnue").replace(/"/g, "'").slice(0, 600);
    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
      '<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2;font-family:sans-serif"><div style="text-align:center;color:#991b1b;max-width:560px;padding:16px"><h2>Erreur</h2><p style="max-width:520px;margin:12px 0;color:#b91c1c;word-break:break-word">' +
        detail +
        '</p><p style="font-size:12px;color:#7f1d1d;word-break:break-all">Log: ' + logPath + '</p><p style="font-size:13px;color:#991b1b">افتح ProfManager مرة أخرى؛ إن استمر الخطأ أرسل محتوى هذا الملف.</p></div></body></html>'
    ));
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
});

app.on("window-all-closed", () => {
  if (!isQuitting) {
    log("all windows closed, keeping app alive in tray");
  } else {
    killServer();
    app.quit();
  }
});

app.on("quit", (event, exitCode) => {
  log("quit event exitCode=" + exitCode);
  killServer();
});
