const { autoUpdater } = require("electron-updater");
const { ipcMain, net, app, shell } = require("electron");
const log = require("electron-log");

const FEED_URL = "https://pub-a093dfe3d51241128f512f880dc36324.r2.dev/";
const currentVersion = require("./package.json").version;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.forceDevUpdateConfig = true;
autoUpdater.setFeedURL({ provider: "generic", url: FEED_URL });

let mainWindow = null;
let registered = false;
let fallbackBusy = false;

let updateState = {
  status: "idle",
  info: null,
  error: null,
  downloadProgress: null,
  canAutoDownload: true,
};

function installerUrl(version, fileName) {
  const file = (fileName || `ProfManager-Setup-${version}.exe`).replace(/ /g, "-");
  return FEED_URL + file;
}

function cmpVer(a, b) {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function parseLatestYml(text) {
  const version = (String(text).match(/^version:\s*['"]?([^\r\n'"#]+)/m) || [])[1];
  const file = (String(text).match(/^\s*-\s*url:\s*['"]?([^\r\n'"]+)/m) || [])[1];
  return {
    version: version ? version.trim() : null,
    file: file ? file.trim() : null,
  };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      const code = response.statusCode || 0;
      let data = "";
      response.on("data", (chunk) => { data += chunk.toString(); });
      response.on("end", () => {
        if (code < 200 || code >= 300) reject(new Error("HTTP " + code));
        else resolve(data);
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function getStatus() {
  return { ...updateState, currentVersion };
}

function sendStatus() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", getStatus());
    }
  } catch {}
}

async function applyChannelFallback() {
  if (fallbackBusy) return getStatus();
  fallbackBusy = true;
  try {
    const yml = await fetchText(FEED_URL + "latest.yml");
    const parsed = parseLatestYml(yml);
    if (!parsed.version) {
      updateState = { status: "idle", info: null, error: null, downloadProgress: null, canAutoDownload: true };
      sendStatus();
      return getStatus();
    }
    const url = installerUrl(parsed.version, parsed.file);
    if (cmpVer(parsed.version, currentVersion) > 0) {
      updateState = {
        status: "available",
        info: { version: parsed.version, downloadUrl: url },
        error: null,
        downloadProgress: null,
        canAutoDownload: false,
      };
    } else {
      updateState = {
        status: "up-to-date",
        info: { version: parsed.version },
        error: null,
        downloadProgress: null,
        canAutoDownload: true,
      };
    }
    sendStatus();
    return getStatus();
  } catch (e) {
    log.warn("updater fallback failed: " + (e.message || e));
    updateState = { status: "idle", info: null, error: null, downloadProgress: null, canAutoDownload: true };
    sendStatus();
    return getStatus();
  } finally {
    fallbackBusy = false;
  }
}

async function checkForUpdates() {
  updateState = { status: "checking", info: null, error: null, downloadProgress: null, canAutoDownload: true };
  sendStatus();
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    log.warn("checkForUpdates failed, using channel file: " + (err.message || err));
    await applyChannelFallback();
    return { ok: true };
  }
}

function registerUpdater(win) {
  mainWindow = win;
  if (registered) return;
  registered = true;

  autoUpdater.on("checking-for-update", () => {
    updateState = { status: "checking", info: null, error: null, downloadProgress: null, canAutoDownload: true };
    sendStatus();
  });

  autoUpdater.on("update-available", (info) => {
    const version = info && info.version;
    const remoteFile = info && (info.path || (info.files && info.files[0] && info.files[0].url));
    updateState = {
      status: "available",
      info: { version, downloadUrl: installerUrl(version, remoteFile) },
      error: null,
      downloadProgress: null,
      canAutoDownload: true,
    };
    sendStatus();
  });

  autoUpdater.on("update-not-available", (info) => {
    updateState = { status: "up-to-date", info, error: null, downloadProgress: null, canAutoDownload: true };
    sendStatus();
  });

  autoUpdater.on("error", (err) => {
    log.error("autoUpdater error: " + ((err && err.stack) || (err && err.message) || err));
    const st = updateState.status;
    if (st === "downloaded") return;
    if (st === "downloading" || st === "available") {
      updateState = {
        ...updateState,
        status: "available",
        canAutoDownload: false,
        downloadProgress: null,
        error: null,
        info: {
          ...(updateState.info || {}),
          downloadUrl: (updateState.info && updateState.info.downloadUrl) || installerUrl(updateState.info && updateState.info.version, null),
        },
      };
      sendStatus();
      return;
    }
    applyChannelFallback();
  });

  autoUpdater.on("download-progress", (progress) => {
    updateState = {
      ...updateState,
      status: "downloading",
      downloadProgress: progress,
      error: null,
    };
    sendStatus();
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateState = { status: "downloaded", info, error: null, downloadProgress: null, canAutoDownload: true };
    sendStatus();
    try {
      const { Notification } = require("electron");
      if (Notification.isSupported()) {
        new Notification({
          title: "ProfManager",
          body: `تحديث v${info.version} جاهز للتثبيت.\nافتح الإعدادات ثم اضغط "تثبيت وإعادة التشغيل".`,
        }).show();
      }
    } catch {}
  });

  ipcMain.handle("update-check", () => checkForUpdates());

  ipcMain.handle("update-download", async () => {
    if (updateState.canAutoDownload === false) {
      return { ok: true, openUrl: updateState.info && updateState.info.downloadUrl };
    }
    try {
      updateState = { ...updateState, status: "downloading", error: null };
      sendStatus();
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      log.warn("downloadUpdate failed: " + (err.message || err));
      await applyChannelFallback();
      return { ok: true, openUrl: updateState.info && updateState.info.downloadUrl };
    }
  });

  ipcMain.handle("update-install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("update-open-url", async (_e, url) => {
    if (!url || typeof url !== "string" || !url.startsWith(FEED_URL)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("update-get-status", () => getStatus());

  log.info("updater registered, current version=" + currentVersion + " packaged=" + app.isPackaged);
}

module.exports = { registerUpdater, getStatus, checkForUpdates };
