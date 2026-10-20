// preload.cjs — the only bridge between renderer (React) and main.
// Sandboxed preloads must be CommonJS, hence .cjs.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("proctor", {
    pickFolder: () => ipcRenderer.invoke("pick-folder"),
    screenAccess: () => ipcRenderer.invoke("screen-access"),
    startExam: () => ipcRenderer.invoke("exam:start"),
    endExam: () => ipcRenderer.invoke("exam:end"),
    saveCamera: (bytes) => ipcRenderer.invoke("save-camera", bytes),
    captureScreen: () => ipcRenderer.invoke("capture-screen"),
    log: (entry) => ipcRenderer.invoke("log", entry),
    onQuitAttempt: (callback) => {
        const listener = () => callback();
        ipcRenderer.on("quit-attempt", listener);
        return () => ipcRenderer.removeListener("quit-attempt", listener);
    }
});
