// preload.cjs — the only bridge between renderer (React) and main.
// Sandboxed preloads must be CommonJS, hence .cjs.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("proctor", {
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
    },
    ping: () => ipcRenderer.invoke("ping")
});
