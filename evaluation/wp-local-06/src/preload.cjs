const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wpLocal06', {
  getPlan: () => ipcRenderer.invoke('wp-local-06:get-plan'),
  run: (scenario) => ipcRenderer.invoke('wp-local-06:run', scenario),
  complete: (results) => ipcRenderer.send('wp-local-06:complete', results),
});
