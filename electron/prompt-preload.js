// Preload for the small prompt window: lets its page hand the answer back to main.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tssPrompt', {
  done: (id, value) => ipcRenderer.send('tss-prompt-done', id, value),
});
