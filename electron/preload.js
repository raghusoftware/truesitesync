// Runs before app.html in the desktop app. The window is sandboxed, so the page
// can't reach Node — this exposes only a synchronous prompt bridge, which the
// shim at the top of app.html wires to window.prompt (Electron has no prompt()).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tssDesktop', {
  prompt: (message, defaultValue) =>
    ipcRenderer.sendSync('tss-prompt', String(message ?? ''), defaultValue == null ? '' : String(defaultValue)),
});
