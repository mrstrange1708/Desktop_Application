# Exam Proctor

Electron + React (Vite) desktop proctoring app.

## Run (two terminals)

```bash
npm install
npm run dev        # terminal 1 — Vite dev server on :5173
npm run electron   # terminal 2 — Electron window loading :5173
```

> Launching from inside VS Code's Claude/extension host? If Electron crashes with
> `does not provide an export named 'BrowserWindow'`, run `env -u ELECTRON_RUN_AS_NODE npm run electron`.

## Structure

```
app/main.js       Electron main process (window, OS-level checks, IPC handlers)
app/preload.cjs   contextBridge — the only API the renderer can call (window.proctor)
src/              React renderer (UI)
index.html        Vite entry
PLAN.md           3-day build plan
```

## IPC channels (`window.proctor`)

| Call | Channel | Direction | What it does |
|---|---|---|---|
| `pickFolder()` | `pick-folder` | UI → main | Folder dialog; where evidence is saved |
| `screenAccess()` | `screen-access` | UI → main | Triggers / reads macOS Screen Recording permission |
| `systemCheck()` | `system-check` | UI → main | `{ displays, restricted }` — display count + restricted apps running |
| `startExam()` | `exam:start` | UI → main | Re-runs system check, creates session folder, kiosk + content protection |
| `endExam()` | `exam:end` | UI → main | Unlocks the window, stops idle watch |
| `saveCamera(bytes)` | `save-camera` | UI → main | Saves a JPEG camera frame |
| `captureScreen()` | `capture-screen` | UI → main | Screenshots displays, saves only if changed (dHash) |
| `log(entry)` | `log` | UI → main | Appends a hash-chained line to `events.jsonl` |
| `verifyLog()` | `verify-log` | UI → main | Re-verifies the hash chain |
| `onQuitAttempt(cb)` | `quit-attempt` | main → UI | Cmd+Q / close during the exam |
| `onEvent(cb)` | `proctor-event` | main → UI | Every logged event (feeds the integrity meter) |

## Session folder

`<chosen folder>/exam-<timestamp>/` holds `camera-*.jpg`, `screen-*.jpg` and `events.jsonl`.
Each log line has `prev` + `hash` (SHA-256 chain — catches edits, not a full rewrite; needs server anchoring). Unchanged screenshots are skipped (logged as `screen-skipped`) but one is forced every 60 s. Main logs focus, shortcuts, idle, displays, start/end itself.

## Tests

`npm test` — audio detectors, integrity score, hash chain, dHash, restricted-app parser.

