const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("updaterAPI", {
  checkForUpdates: () => ipcRenderer.invoke("update-check"),
  downloadUpdate: () => ipcRenderer.invoke("update-download"),
  installUpdate: () => ipcRenderer.invoke("update-install"),
  openInstaller: (url) => ipcRenderer.invoke("update-open-url", url),
  getStatus: () => ipcRenderer.invoke("update-get-status"),
  onStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
});
