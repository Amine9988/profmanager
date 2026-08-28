const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('activation', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
});
