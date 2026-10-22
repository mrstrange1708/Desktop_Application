// preload.cjs — the only bridge between renderer (React) and main.
// Sandboxed preloads must be CommonJS, hence .cjs.
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("proctor", {
    pickFolder: () => ipcRenderer.invoke("pick-folder"),
    screenAccess: () => ipcRenderer.invoke("screen-access"),
    systemCheck: () => ipcRenderer.invoke("system-check"),
    startExam: (candidate) => ipcRenderer.invoke("exam:start", candidate),
    endExam: () => ipcRenderer.invoke("exam:end"),
    saveCamera: (bytes) => ipcRenderer.invoke("save-camera", bytes),
    captureScreen: () => ipcRenderer.invoke("capture-screen"),
    log: (entry) => ipcRenderer.invoke("log", entry),
    saveAnswers: (answers) => ipcRenderer.invoke("save-answers", answers),
    sessionReport: () => ipcRenderer.invoke("session-report"),
    openSession: () => ipcRenderer.invoke("open-session"),
    onQuitAttempt: (callback) => subscribe("quit-attempt", callback),
    onEvent: (callback) => subscribe("proctor-event", callback)
});
