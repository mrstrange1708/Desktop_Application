// main.js — Electron main process
import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        webPreferences: {
            preload: path.join(import.meta.dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
    } else {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    }
}

// Smoke test for the IPC bridge — renderer calls window.proctor.ping()
ipcMain.handle("ping", () => "pong from main");

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
