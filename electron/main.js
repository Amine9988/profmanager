const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");

const { registerUpdater, checkForUpdates: checkUpdates } = require("./updater");

const {
  getHardwareId,
  verifyLicense,
  saveLicense,
  checkLicenseOnStartup,
} = require("./license");

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
  if (process.platform !== "win32") {
    // macOS prompts on first inbound listen; no netsh equivalent is required.
    log("firewall: skip on " + process.platform + " port=" + port);
    return true;
  }
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
  const bin = process.platform === "win32" ? "adb.exe" : "adb";
  const roots = [
    path.join(process.resourcesPath || __dirname, "platform-tools"),
    path.join(__dirname, "platform-tools"),
  ];
  const names = process.platform === "win32" ? [bin] : [bin, "adb.exe"];
  for (const root of roots) {
    for (const name of names) {
      const p = path.join(root, name);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  try {
    const which = process.platform === "win32" ? "where adb" : "which adb";
    const found = execSync(which, { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) return found;
  } catch {}
  return null;
}

// Windows Defender scans every file of a freshly installed Electron app on first
// read, which makes the standalone server's cold module load take 10-25s. Adding
// a Defender exclusion for the install dir cuts cold startup to ~2-4s.
function ensureDefenderExclusion(dir) {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    // The Defender exclusion list is only fully visible to elevated processes,
    // so a non-elevated probe cannot reliably detect an existing exclusion and
    // would re-show the UAC prompt on every launch. Only attempt it once per
    // userData.
    const flag = path.join(app.getPath("userData"), "defender-exclusion-attempted.flag");
    if (fs.existsSync(flag)) return resolve(false);
    try { fs.writeFileSync(flag, new Date().toISOString()); } catch {}
    const probe = spawn("powershell.exe", [
      "-NoProfile", "-Command",
      "$p = (Get-MpPreference).ExclusionPath; if ($p -contains '" + dir + "') { 'present' } else { 'absent' }",
    ], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    probe.stdout.on("data", (d) => (out += d));
    probe.on("error", () => resolve(false));
    probe.on("exit", (code) => {
      if (code !== 0 || out.trim() !== "absent") return resolve(false);
      // Not excluded — add it via a one-time UAC elevation using a temp script.
      const script = path.join(os.tmpdir(), "pm-defender-exclusion.ps1");
      try {
        fs.writeFileSync(script, 'Add-MpPreference -ExclusionPath "' + dir + '"\n');
      } catch { return resolve(false); }
      log("requesting Defender exclusion for " + dir);
      const add = spawn("powershell.exe", [
        "-NoProfile", "-Command",
        "Start-Process -Verb RunAs -Wait -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','" + script + "'",
      ], { stdio: "ignore" });
      add.on("error", () => resolve(false));
      add.on("exit", () => { log("defender exclusion attempt finished"); resolve(true); });
    });
    setTimeout(() => { probe.kill(); resolve(false); }, 8000);
  });
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
let activationWindow = null;
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
    if (process.platform === "win32") {
      execSync("taskkill /PID " + pid + " /T /F", {
        stdio: "ignore",
        timeout: 5000,
      });
    } else {
      try { process.kill(-pid, "SIGTERM"); } catch {}
      try { execSync("kill -TERM -" + pid, { stdio: "ignore", timeout: 3000 }); } catch {}
      try { execSync("kill -KILL -" + pid, { stdio: "ignore", timeout: 3000 }); } catch {}
      try { serverChild.kill("SIGKILL"); } catch {}
    }
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
  const names = process.platform === "darwin"
    ? ["icon.icns", "icon.png", "icon.ico"]
    : ["icon.ico", "icon.png"];
  const dirs = [
    path.join(__dirname, "public"),
    path.join(process.resourcesPath || "", "app", "public"),
    process.resourcesPath || "",
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      const p = path.join(dir, name);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
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

function checkOverview(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:" + port + "/overview", (res) => {
      res.resume();
      resolve(true); // any response means the server actually renders pages
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs || 3500, () => { req.destroy(); resolve(false); });
  });
}

function killPortOwner(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano | findstr /R \":" + port + " .*LISTENING\"", {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pids = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/\s+(\d+)\s*$/);
        if (m && line.includes("LISTENING")) pids.push(m[1]);
      }
      for (const pid of pids) {
        if (pid && pid !== String(process.pid)) {
          log("killing broken port owner pid=" + pid);
          try { execSync("taskkill /PID " + pid + " /T /F", { stdio: "ignore", timeout: 5000 }); } catch {}
        }
      }
      return;
    }
    const out = execSync("lsof -tiTCP:" + port + " -sTCP:LISTEN", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const pid of out.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
      if (pid && pid !== String(process.pid)) {
        log("killing broken port owner pid=" + pid);
        try { execSync("kill -TERM " + pid, { stdio: "ignore", timeout: 3000 }); } catch {}
      }
    }
  } catch {}
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
    detached: process.platform !== "win32",
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
      (p) => {
        // Guard against a race: our child may have failed to bind (EADDRINUSE)
        // right after the poll was satisfied by ANOTHER instance's server on the
        // same port. Only claim success if our own child is still alive.
        if (exited) {
          reject(new Error("server exited after poll: " + stderrBuf.slice(0, 400)));
          return;
        }
        resolve({ port: p, child });
      },
      (err) => reject(new Error(err.message + (stderrBuf ? " | server: " + stderrBuf.slice(0, 500) : "")))
    );
  });
}

async function startServer(standaloneDir) {
  const PORTS = [3001, 3002, 3003, 3004, 3005];
  // If any server is already listening, attach to it. The page load retry below
  // absorbs slow cold starts, so no /overview liveness check is needed here.
  for (const port of PORTS) {
    if (!(await isPortFree(port))) {
      log("attaching to existing server on port " + port);
      return { port, child: null };
    }
  }
  let lastErr = "";
  for (const port of PORTS) {
    log("trying port " + port);
    if (!(await isPortFree(port))) {
      log("port " + port + " became occupied meanwhile - attaching");
      return { port, child: null };
    }
    try {
      const r = await spawnServer(standaloneDir, port);
      log("server ready on port " + port);
      return r;
    } catch (e) {
      lastErr = e.message;
      log("port " + port + " failed: " + e.message);
      // A concurrent instance may have grabbed the port, or our own child may
      // have died from EADDRINUSE. If the port is now occupied by a live server,
      // use it instead of failing the whole launch.
      if (!(await isPortFree(port))) {
        log("port " + port + " now occupied - attaching to it");
        return { port, child: serverChild };
      }
      killServer();
    }
  }
  // Last resort: force a free port by killing broken/hung owners (best effort;
  // cross-integrity owners can't be killed and are simply skipped).
  for (const port of PORTS) {
    killPortOwner(port);
  }
  for (const port of PORTS) {
    if (await isPortFree(port)) {
      try {
        const r = await spawnServer(standaloneDir, port);
        log("server ready on port " + port + " (after cleanup)");
        return r;
      } catch (e) { lastErr = e.message; killServer(); }
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
      click: () => { mainWindow.show(); mainWindow.focus(); if (mainWindow.webContents) mainWindow.webContents.focus(); },
    },
    { type: "separator" },
    {
      label: "إنهاء ProfManager (يوقف الخادم)",
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); if (mainWindow.webContents) mainWindow.webContents.focus(); });
}

function showErrorPage(detail) {
  const logPath = LOG.replace(/\\/g, "/");
  const d = (detail || "Erreur inconnue").replace(/"/g, "'").slice(0, 600);
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    '<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2;font-family:sans-serif"><div style="text-align:center;color:#991b1b;max-width:560px;padding:16px"><h2>Erreur</h2><p style="max-width:520px;margin:12px 0;color:#b91c1c;word-break:break-word">' +
      d +
      '</p><p style="font-size:12px;color:#7f1d1d;word-break:break-all">Log: ' + logPath + '</p><p style="font-size:13px;color:#991b1b">افتح ProfManager مرة أخرى؛ إن استمر الخطأ أرسل محتوى هذا الملف.</p></div></body></html>'
  ));
}

function showLoadingPage() {
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:Segoe UI,sans-serif;color:#e2e8f0}.wrap{text-align:center}.spinner{width:44px;height:44px;margin:0 auto 18px;border:4px solid #334155;border-top-color:#38bdf8;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.t{font-size:15px;letter-spacing:.3px}</style></head><body><div class="wrap"><div class="spinner"></div><div class="t">جاري تشغيل ProfManager...</div></div></body></html>'
  ));
}

/**
 * Bring the window and its renderer to the front.
 *
 * Startup replaces the loading page with a brand new document, and a fresh
 * renderer starts unfocused: Windows then spends the user's first click
 * activating the page instead of hitting the button under the cursor.
 * Called only at startup, so it cannot steal the caret while typing.
 */
function focusAppWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  } catch {}
}

function loadWithRetry(url, attempts) {
  return new Promise((resolve) => {
    let tries = 0;
    let settled = false;
    const cleanup = () => {
      mainWindow.webContents.removeListener("did-fail-load", onFail);
      mainWindow.webContents.removeListener("did-finish-load", onLoad);
    };
    const onLoad = () => {
      if (settled) return;
      settled = true;
      cleanup();
      log("page loaded try=" + tries);
      resolve(true);
    };
    const onFail = (e, code, desc) => {
      if (code === -3 || settled) return; // superseded navigation
      log("did-fail-load try=" + tries + " code=" + code + " desc=" + desc);
      if (tries >= attempts) {
        settled = true;
        cleanup();
        resolve(false);
        return;
      }
      // The server may still be starting (cold start) — retry shortly.
      setTimeout(() => {
        if (settled) return;
        tries++;
        mainWindow.loadURL(url);
      }, 2000);
    };
    mainWindow.webContents.on("did-fail-load", onFail);
    mainWindow.webContents.on("did-finish-load", onLoad);
    tries++;
    mainWindow.loadURL(url);
  });
}

/**
 * Electron ships no context menu at all, so right-clicking a field offered
 * nothing and pasting was keyboard-only (Ctrl+V).
 */
function attachEditContextMenu(webContents) {
  webContents.on("context-menu", (event, params) => {
    const flags = params.editFlags || {};
    const hasSelection = !!params.selectionText;
    const items = [];

    if (params.isEditable && flags.canCut && hasSelection) {
      items.push({ label: "قص", role: "cut" });
    }
    if (flags.canCopy && hasSelection) {
      items.push({ label: "نسخ", role: "copy" });
    }
    if (params.isEditable && flags.canPaste) {
      items.push({ label: "لصق", role: "paste" });
    }
    if (params.isEditable && flags.canSelectAll) {
      items.push({ type: "separator" }, { label: "تحديد الكل", role: "selectAll" });
    }

    if (!items.length) return;
    const window = BrowserWindow.fromWebContents(webContents);
    Menu.buildFromTemplate(items).popup({ window, x: params.x, y: params.y });
  });
}

function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 480,
    height: 460,
    resizable: false,
    icon: resolveIcon(),
    title: "تفعيل ProfManager",
    webPreferences: {
      preload: path.join(__dirname, "activation-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  activationWindow.setMenuBarVisibility(false);
  attachEditContextMenu(activationWindow.webContents);
  activationWindow.loadFile("activation.html");
  activationWindow.on("closed", () => { activationWindow = null; });
}

ipcMain.handle("get-hardware-id", () => getHardwareId());

ipcMain.handle("activate-license", (event, licenseKey) => {
  const result = verifyLicense(licenseKey);
  if (result.valid) {
    saveLicense(app, licenseKey);
    if (activationWindow && !activationWindow.isDestroyed()) activationWindow.close();
    activationWindow = null;
    launchMainApp();
  }
  return result;
});

async function launchMainApp() {
  const STANDALONE_DIR = path.join(process.resourcesPath || __dirname, "standalone-server");
  log("standalone=" + STANDALONE_DIR);
  log("server exists=" + fs.existsSync(path.join(STANDALONE_DIR, "server.js")));

  // Best-effort: exclude the app dir from Windows Defender so the server's cold
  // module load is fast. Doesn't block startup; helps every future launch.
  ensureDefenderExclusion(STANDALONE_DIR).then((ok) => log("defender exclusion ensured=" + ok));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    icon: resolveIcon(),
    title: "ProfManager",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  attachEditContextMenu(mainWindow.webContents);
  registerUpdater(mainWindow);

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
  // Only force webContents focus when showing from tray — calling it on every
  // window "focus" steals caret from inputs on Windows (typing freeze).
  mainWindow.on("show", () => {
    try {
      if (mainWindow.webContents && !mainWindow.webContents.isFocused()) {
        mainWindow.webContents.focus();
      }
    } catch {}
  });

  // A full navigation swaps in a fresh document that starts unfocused, so the
  // next click would be spent focusing the page. In-page (client-side) route
  // changes don't fire this, so the caret is never taken while typing.
  mainWindow.webContents.on("did-navigate", () => {
    try {
      if (mainWindow.isFocused() && !mainWindow.webContents.isFocused()) {
        mainWindow.webContents.focus();
      }
    } catch {}
  });

  // Show the window immediately with a styled loading page, then load the
    // real app once the (possibly slow cold-starting) server is ready.
    showLoadingPage();
    mainWindow.once("ready-to-show", () => { log("window displayed (loading)"); mainWindow.show(); });

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
      const loaded = await loadWithRetry("http://127.0.0.1:" + port + "/overview", 30);
      if (!loaded) {
        showErrorPage("Le serveur local n'a pas répondu après plusieurs tentatives. Vérifiez le fichier log puis relancez.");
        focusAppWindow();
      } else {
        // Re-run after the first paints: the renderer can drop focus again
        // while it hydrates, which would still swallow the first click.
        focusAppWindow();
        setTimeout(focusAppWindow, 150);
        setTimeout(focusAppWindow, 600);
        setTimeout(() => {
          try { checkUpdates(); } catch (e) { log("auto-check failed: " + e.message); }
        }, 5000);
      }
    } catch (err) {
      log("ERR=" + (err.stack || err.message));
      showErrorPage(err.message || "Erreur inconnue");
    }
}

app.whenReady().then(() => {
  log("ready platform=" + process.platform + " arch=" + process.arch);
  if (process.platform === "darwin" && app.dock) {
    try {
      const ic = resolveIcon();
      if (ic) app.dock.setIcon(ic);
    } catch {}
  }

  const licenseResult = checkLicenseOnStartup(app);
  log("license check valid=" + licenseResult.valid + " reason=" + (licenseResult.reason || "none"));

  if (licenseResult.valid) {
    launchMainApp();
  } else {
    createActivationWindow();
  }
});

app.on("window-all-closed", () => {
  if (!isQuitting && serverOwned) {
    log("all windows closed, keeping app alive in tray");
  } else {
    log("window-all-closed: quitting (serverOwned=" + serverOwned + ")");
    killServer();
    app.quit();
  }
});

app.on("quit", (event, exitCode) => {
  log("quit event exitCode=" + exitCode);
  killServer();
});
