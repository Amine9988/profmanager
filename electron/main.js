const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 3456;
const LOG_FILE = path.join(app.getPath("userData"), "profmanager-server.log");
const isPackaged = app.isPackaged;
const STANDALONE_DIR = isPackaged
  ? path.join(process.resourcesPath, "standalone-server")
  : path.join(__dirname, "standalone-server");

let mainWindow;
let serverProcess;
let resolved = false;

function log(msg) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + " " + msg + "\n"); } catch {}
}

function loadEnvFile(envPath) {
  const result = {};
  if (!fs.existsSync(envPath)) return result;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    http.get(url, (res) => { res.resume(); resolve(true); }).on("error", reject);
  });
}

async function waitForServer(url, maxRetries) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await httpGet(url);
      return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer() {
  return new Promise((resolve, reject) => {
    resolved = false;
    const serverPath = path.join(STANDALONE_DIR, "server.js");
    const envPath = path.join(STANDALONE_DIR, ".env");

    const env = { ...process.env };
    env.PORT = PORT.toString();
    env.NODE_ENV = "production";
    env.ELECTRON_RUN_AS_NODE = "1";

    const envFile = loadEnvFile(envPath);
    log("Loaded " + Object.keys(envFile).length + " env vars from .env");
    for (const [k, v] of Object.entries(envFile)) {
      if (!(k in env)) env[k] = v;
    }

    log("Standalone dir: " + STANDALONE_DIR);
    log("Server path: " + serverPath);
    log("Exists: " + fs.existsSync(serverPath));

    if (!fs.existsSync(serverPath)) {
      reject(new Error("Server not found at " + serverPath));
      return;
    }

    serverProcess = spawn(process.execPath, [serverPath], {
      env,
      cwd: STANDALONE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (data) => log(data.toString().trim()));
    serverProcess.stderr.on("data", (data) => log(data.toString().trim()));

    serverProcess.on("error", (err) => {
      log("[error] " + err.message);
      if (!resolved) { resolved = true; reject(err); }
    });

    serverProcess.on("exit", (code, signal) => {
      log("[exit] code=" + code + " signal=" + signal);
      if (!resolved) {
        resolved = true;
        reject(new Error("Server exited with code " + code));
      }
    });

    const serverUrl = `http://localhost:${PORT}`;
    const healthCheck = async () => {
      const ok = await waitForServer(serverUrl, 30);
      if (!resolved) {
        resolved = true;
        if (ok) resolve();
        else reject(new Error("Server did not respond within 15s"));
      }
    };
    healthCheck();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 600,
    title: "ProfManager",
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  mainWindow.loadURL(`http://localhost:${PORT}/login`);
  mainWindow.once("ready-to-show", () => { mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  mainWindow.on("closed", () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  try {
    log("App starting...");
    await startServer();
    log("Server ready, creating window");
    createWindow();
  } catch (err) {
    log("[fatal] " + err.message);
    console.error("Failed to start server:", err);
    dialog.showErrorBox("Erreur de démarrage", "Impossible de démarrer le serveur.\n" + err.message + "\n\nConsultez le fichier de log pour plus de détails:\n" + LOG_FILE);
    app.quit();
  }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { if (serverProcess) { serverProcess.kill(); serverProcess = null; } });
