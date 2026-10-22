// main.js — Electron main process
import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, systemPreferences, screen, powerMonitor, shell, protocol, net, session } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { GENESIS, chainEntry, verifyChain, grayFromBitmap, dHash, hamming } from "./evidence.js";
import { runningRestrictedApps } from "./processes.js";

const IDLE_LIMIT_S = 120;     // no keyboard/mouse input for this long gets logged
// ponytail: 9x8 whole-screen dHash can miss small changes (a chat popup), hence the forced
// save every SCREEN_FORCE_SAVE_MS; switch to per-region hashes if that proves too coarse.
const SCREEN_CHANGE_BITS = 4;          // dHash distance that counts as "screen changed"
const SCREEN_FORCE_SAVE_MS = 60_000;   // save at least this often even when nothing changed

// Dev-only switches for automated runs; ignored in the packaged app.
const DEV_TEST = app.isPackaged ? {} : {
    folder: process.env.PROCTOR_TEST_FOLDER, // skip the folder dialog
    noLock: process.env.PROCTOR_NO_LOCK === "1", // no kiosk / always-on-top, so a test run can't lock the screen
    hidden: process.env.PROCTOR_HIDDEN === "1", // never show the window (scripts/e2e.mjs)
    skipAppCheck: process.env.PROCTOR_SKIP_APP_CHECK === "1", // don't make the tester quit their own apps
    useDist: process.env.PROCTOR_USE_DIST === "1" // load the production build through app:// like the packaged app
};

// Production build is served from app://bundle/ (a private, sandboxed origin) instead of file://.
const useDist = app.isPackaged || DEV_TEST.useDist;
const DIST_DIR = path.join(import.meta.dirname, "../dist");
const APP_ORIGIN = useDist ? "app://bundle" : "http://localhost:5173";
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// A packaged exam app must not be steerable through a debugger.
if (app.isPackaged && ["remote-debugging-port", "remote-debugging-pipe", "inspect", "inspect-brk"].some((s) => app.commandLine.hasSwitch(s))) {
    app.exit(1);
}

let mainWindow = null;
let examActive = false;
let chosenFolder = null; // picked by the student on the setup screen
let sessionDir = null;   // <chosenFolder>/exam-<timestamp>, created when the exam starts
let lastHash = GENESIS;  // head of the events.jsonl hash chain
let idleTimer = null;
const lastScreenSave = new Map(); // display id → { hash, at } of the last saved screenshot

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        show: !DEV_TEST.hidden,
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

    mainWindow.loadURL(`${APP_ORIGIN}/${useDist ? "index.html" : ""}`);
    if (!app.isPackaged) {
        if (!DEV_TEST.hidden) mainWindow.webContents.openDevTools();
        // Devtools closes during the exam, so mirror renderer warnings/errors to the terminal.
        mainWindow.webContents.on("console-message", (event) => {
            if (event.level === "warning" || event.level === "error") console.log(`[renderer ${event.level}] ${event.message}`);
        });
    }

    // The exam window only ever shows our own page: no navigation, no pop-ups.
    mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
    if (DEV_TEST.noLock) return;
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
    return { displays: screen.getAllDisplays().length, restricted: DEV_TEST.skipAppCheck ? [] : await runningRestrictedApps() };
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

// Every IPC handler only answers our own page; anything else (an injected frame, a stray
// webview) is refused before the handler runs.
// (Prefix match: Node's URL reports custom-scheme origins like app:// as "null".)
const isOurs = (url) => typeof url === "string" && (url === APP_ORIGIN || url.startsWith(APP_ORIGIN + "/"));

function handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isOurs(event.senderFrame?.url)) throw new Error("Blocked IPC from untrusted frame");
        return handler(event, ...args);
    });
}

handle("pick-folder", async () => {
    if (DEV_TEST.folder) return (chosenFolder = DEV_TEST.folder);
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Choose where exam captures are saved",
        properties: ["openDirectory", "createDirectory"]
    });
    if (!canceled) chosenFolder = filePaths[0];
    return chosenFolder;
});

handle("screen-access", async () => {
    if (process.platform !== "darwin") return "granted";
    // The first getSources call is what makes macOS show the Screen Recording prompt.
    await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
    return systemPreferences.getMediaAccessStatus("screen");
});

handle("system-check", systemCheck);

handle("exam:start", async () => {
    if (!chosenFolder) throw new Error("No evidence folder chosen");
    // Re-check here: main is the authority, the setup screen is only a convenience.
    const { displays, restricted } = await systemCheck();
    if (displays > 1) throw new Error("Disconnect extra displays before starting");
    if (restricted.length) throw new Error(`Close these apps before starting: ${restricted.join(", ")}`);

    sessionDir = path.join(chosenFolder, `exam-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    lastHash = GENESIS;
    lastScreenSave.clear();
    writeLog({ type: "exam-start" });
    examActive = true;
    lockWindow(true);
    idleTimer = watchIdle();
    return sessionDir;
});

handle("exam:end", () => {
    writeLog({ type: "exam-end" });
    examActive = false;
    clearInterval(idleTimer);
    lockWindow(false);
});

handle("save-camera", (_event, bytes) => {
    if (!sessionDir || !(bytes instanceof Uint8Array) || bytes.length > 5_000_000) return;
    return fs.promises.writeFile(path.join(sessionDir, `camera-${Date.now()}.jpg`), bytes);
});

// Screenshots every display; saves when the content changed or the last save is older than
// SCREEN_FORCE_SAVE_MS. Skipped captures are logged with their distance so gaps are auditable.
handle("capture-screen", async () => {
    if (!sessionDir) return;
    try {
        await captureScreens();
    } catch (error) {
        writeLog({ type: "capture-error", source: "screen", message: error.message });
    }
});

async function captureScreens() {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 800 } });
    const stamp = Date.now();
    await Promise.all(sources.filter((source) => !source.thumbnail.isEmpty()).map((source, i) => {
        const hash = dHash(grayFromBitmap(source.thumbnail.resize({ width: 9, height: 8 }).toBitmap()));
        const last = lastScreenSave.get(source.display_id);
        if (last && stamp - last.at < SCREEN_FORCE_SAVE_MS) {
            const distance = hamming(last.hash, hash);
            if (distance <= SCREEN_CHANGE_BITS) {
                writeLog({ type: "screen-skipped", display: i, hash: hash.toString(16), distance });
                return;
            }
        }
        lastScreenSave.set(source.display_id, { hash, at: stamp });
        return fs.promises.writeFile(path.join(sessionDir, `screen-${stamp}-${i}.jpg`), source.thumbnail.toJPEG(70));
    }));
}

handle("log", (_event, entry) => {
    if (typeof entry?.type !== "string") return;
    writeLog(entry);
});

handle("save-answers", (_event, answers) => {
    if (!sessionDir || !examActive || typeof answers !== "object" || answers === null) return;
    const json = JSON.stringify({ savedAt: new Date().toISOString(), answers }, null, 2);
    if (json.length > 100_000) return;
    return fs.promises.writeFile(path.join(sessionDir, "answers.json"), json);
});

// Everything the result screen needs: chain check + the events themselves for the timeline.
handle("session-report", () => {
    if (!sessionDir) return null;
    const text = fs.readFileSync(path.join(sessionDir, "events.jsonl"), "utf8");
    const events = text.split("\n").filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
    });
    return { chain: verifyChain(text), events };
});

handle("open-session", () => sessionDir && shell.openPath(sessionDir));

app.whenReady().then(() => {
    // The packaged app gets its icon from the bundle; in dev, show it in the Dock too.
    if (!app.isPackaged && process.platform === "darwin") app.dock.setIcon(path.join(import.meta.dirname, "../build/icon.png"));

    // app://bundle/<path> → dist/<path>, never anything outside dist.
    protocol.handle("app", (request) => {
        const file = path.join(DIST_DIR, decodeURIComponent(new URL(request.url).pathname));
        if (!file.startsWith(DIST_DIR + path.sep)) return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
    });

    // Only camera + microphone, and only for our own page.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
        callback(permission === "media" && isOurs(details.requestingUrl));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => permission === "media" && isOurs(origin));

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
