const { app, BrowserWindow, shell } = require("electron");
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

function log(msg) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + " " + msg + "\n"); } catch {}
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: PORT.toString(),
      NODE_ENV: "production",
      ELECTRON_RUN_AS_NODE: "1",
    };
    const serverPath = path.join(STANDALONE_DIR, "server.js");

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

    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      log("[stdout] " + msg.trim());
      if (msg.includes("Ready") || msg.includes("ready") || msg.includes(String(PORT))) resolve();
    });

    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      log("[stderr] " + msg.trim());
      if (msg.includes("Ready") || msg.includes("ready") || msg.includes(String(PORT))) resolve();
    });

    serverProcess.on("error", (err) => {
      log("[error] " + err.message);
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      log("[exit] code=" + code + " signal=" + signal);
      if (code !== 0) reject(new Error("Server exited with code " + code));
    });

    setTimeout(() => {
      log("[timeout] 8s elapsed, resolving anyway");
      resolve();
    }, 8000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 600,
    title: "ProfManager",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  mainWindow.on("closed", () => { mainWindow = null; });
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
    app.quit();
  }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { if (serverProcess) { serverProcess.kill(); serverProcess = null; } });
