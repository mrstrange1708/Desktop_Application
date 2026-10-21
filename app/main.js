// main.js — Electron main process
import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, systemPreferences, screen, powerMonitor } from "electron";
import path from "path";
import fs from "fs";
import { GENESIS, chainEntry, verifyChain, grayFromBitmap, dHash, hamming } from "./evidence.js";
import { runningRestrictedApps } from "./processes.js";

const IDLE_LIMIT_S = 120;     // no keyboard/mouse input for this long gets logged
const SCREEN_CHANGE_BITS = 4; // ponytail: dHash distance that counts as "screen changed", tune if too chatty

let mainWindow = null;
let examActive = false;
let chosenFolder = null; // picked by the student on the setup screen
let sessionDir = null;   // <chosenFolder>/exam-<timestamp>, created when the exam starts
let lastHash = GENESIS;  // head of the events.jsonl hash chain
let idleTimer = null;
const lastScreenHash = new Map(); // display id → dHash of the last saved screenshot

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
            devTools: !app.isPackaged,
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
        if (!shortcut && !/^F\d+$/.test(input.key)) return;
        event.preventDefault();
        if (!input.isAutoRepeat) writeLog({ type: "blocked-shortcut", key: `${input.meta ? "Cmd+" : input.control ? "Ctrl+" : ""}${input.key}` });
    });

    // Main records focus changes itself so the log doesn't depend on the renderer.
    mainWindow.on("blur", () => examActive && writeLog({ type: "focus-lost" }));
    mainWindow.on("focus", () => examActive && writeLog({ type: "focus-back" }));

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

// Appends a hash-chained line to events.jsonl and forwards it to the renderer (integrity meter).
function writeLog(entry) {
    if (!sessionDir) return;
    const { prev, hash, at, ...fields } = entry; // chain fields and timestamp are main's alone
    const line = chainEntry(lastHash, { ...fields, at: new Date().toISOString() });
    lastHash = line.hash;
    fs.appendFileSync(path.join(sessionDir, "events.jsonl"), JSON.stringify(line) + "\n"); // sync keeps chain order
    mainWindow?.webContents.send("proctor-event", line);
}

async function systemCheck() {
    return { displays: screen.getAllDisplays().length, restricted: await runningRestrictedApps() };
}

// Logs once when the student goes idle, re-arms once they are active again.
function watchIdle() {
    let flagged = false;
    return setInterval(() => {
        const idle = powerMonitor.getSystemIdleTime();
        if (idle >= IDLE_LIMIT_S && !flagged) writeLog({ type: "idle", seconds: idle });
        flagged = idle >= IDLE_LIMIT_S;
    }, 5000);
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

ipcMain.handle("system-check", systemCheck);

ipcMain.handle("exam:start", async () => {
    if (!chosenFolder) throw new Error("No evidence folder chosen");
    // Re-check here: main is the authority, the setup screen is only a convenience.
    const { displays, restricted } = await systemCheck();
    if (displays > 1) throw new Error("Disconnect extra displays before starting");
    if (restricted.length) throw new Error(`Close these apps before starting: ${restricted.join(", ")}`);

    sessionDir = path.join(chosenFolder, `exam-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    lastHash = GENESIS;
    lastScreenHash.clear();
    writeLog({ type: "exam-start" });
    examActive = true;
    lockWindow(true);
    idleTimer = watchIdle();
    return sessionDir;
});

ipcMain.handle("exam:end", () => {
    writeLog({ type: "exam-end" });
    examActive = false;
    clearInterval(idleTimer);
    lockWindow(false);
});

ipcMain.handle("save-camera", (_event, bytes) => {
    if (!sessionDir || !(bytes instanceof Uint8Array) || bytes.length > 5_000_000) return;
    return fs.promises.writeFile(path.join(sessionDir, `camera-${Date.now()}.jpg`), bytes);
});

// Screenshots every display but only saves the ones whose content changed since the last save.
ipcMain.handle("capture-screen", async () => {
    if (!sessionDir) return;
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 800 } });
    const stamp = Date.now();
    await Promise.all(sources.filter((source) => !source.thumbnail.isEmpty()).map((source, i) => {
        const hash = dHash(grayFromBitmap(source.thumbnail.resize({ width: 9, height: 8 }).toBitmap()));
        const previous = lastScreenHash.get(source.display_id);
        if (previous !== undefined && hamming(previous, hash) <= SCREEN_CHANGE_BITS) return;
        lastScreenHash.set(source.display_id, hash);
        return fs.promises.writeFile(path.join(sessionDir, `screen-${stamp}-${i}.jpg`), source.thumbnail.toJPEG(70));
    }));
});

ipcMain.handle("log", (_event, entry) => {
    if (typeof entry?.type !== "string") return;
    writeLog(entry);
});

ipcMain.handle("verify-log", () => {
    if (!sessionDir) return null;
    return verifyChain(fs.readFileSync(path.join(sessionDir, "events.jsonl"), "utf8"));
});

app.whenReady().then(() => {
    screen.on("display-added", () => examActive && writeLog({ type: "display-added" }));
    createWindow();
});

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
