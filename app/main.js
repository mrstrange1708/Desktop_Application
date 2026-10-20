// main.js — Electron main process
import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, systemPreferences } from "electron";
import path from "path";
import fs from "fs";

let mainWindow = null;
let examActive = false;
let chosenFolder = null; // picked by the student on the setup screen
let sessionDir = null;   // <chosenFolder>/exam-<timestamp>, created when the exam starts

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        backgroundColor: "#f6f7f9",
        webPreferences: {
            preload: path.join(import.meta.dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false // keep timers + audio analysis running while the window is unfocused
        }
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
    } else {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    }

    // During the exam swallow every Cmd/Ctrl shortcut (copy, paste, reload, devtools, hide, minimize…)
    // and F-keys. Cmd+Q is let through on purpose so it reaches the quit-attempt flow below.
    mainWindow.webContents.on("before-input-event", (event, input) => {
        if (!examActive || input.type !== "keyDown") return;
        const shortcut = (input.meta || input.control) && input.key.toLowerCase() !== "q";
        if (shortcut || /^F\d+$/.test(input.key)) event.preventDefault();
    });

    mainWindow.on("close", (event) => {
        if (!examActive) return;
        event.preventDefault();
        mainWindow.webContents.send("quit-attempt");
    });
}

function lockWindow(on) {
    mainWindow.setKiosk(on); // fullscreen; on macOS also disables Cmd+Tab and hides the Dock
    mainWindow.setAlwaysOnTop(on, "screen-saver");
    mainWindow.setContentProtection(on); // window shows up black in screenshots / screen recordings
    if (on) mainWindow.webContents.closeDevTools();
}

ipcMain.handle("pick-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Choose where exam captures are saved",
        properties: ["openDirectory", "createDirectory"]
    });
    if (!canceled) chosenFolder = filePaths[0];
    return chosenFolder;
});

ipcMain.handle("screen-access", async () => {
    if (process.platform !== "darwin") return "granted";
    // The first getSources call is what makes macOS show the Screen Recording prompt.
    await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
    return systemPreferences.getMediaAccessStatus("screen");
});

ipcMain.handle("exam:start", () => {
    if (!chosenFolder) throw new Error("No evidence folder chosen");
    sessionDir = path.join(chosenFolder, `exam-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    examActive = true;
    lockWindow(true);
    return sessionDir;
});

ipcMain.handle("exam:end", () => {
    examActive = false;
    lockWindow(false);
});

ipcMain.handle("save-camera", (_event, bytes) => {
    if (!sessionDir || !(bytes instanceof Uint8Array) || bytes.length > 5_000_000) return;
    return fs.promises.writeFile(path.join(sessionDir, `camera-${Date.now()}.jpg`), bytes);
});

ipcMain.handle("capture-screen", async () => {
    if (!sessionDir) return;
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 800 } });
    const stamp = Date.now();
    await Promise.all(sources
        .filter((source) => !source.thumbnail.isEmpty())
        .map((source, i) => fs.promises.writeFile(path.join(sessionDir, `screen-${stamp}-${i}.jpg`), source.thumbnail.toJPEG(70))));
});

ipcMain.handle("log", (_event, entry) => {
    if (!sessionDir || typeof entry?.type !== "string") return;
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
    return fs.promises.appendFile(path.join(sessionDir, "events.jsonl"), line);
});

app.whenReady().then(createWindow);

// Cmd+Q / Dock quit during the exam → ask the renderer to run the 5-second return countdown instead.
app.on("before-quit", (event) => {
    if (!examActive) return;
    event.preventDefault();
    mainWindow.webContents.send("quit-attempt");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
