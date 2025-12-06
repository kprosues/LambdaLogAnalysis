const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openTuneFileDialog: () => ipcRenderer.invoke('open-tune-file-dialog'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onToggleDarkMode: (callback) => ipcRenderer.on('toggle-dark-mode', callback),
  removeToggleDarkModeListener: () => ipcRenderer.removeAllListeners('toggle-dark-mode'),
  onOpenTooltipSettings: (callback) => ipcRenderer.on('open-tooltip-settings', callback),
  removeOpenTooltipSettingsListener: () => ipcRenderer.removeAllListeners('open-tooltip-settings')
});

