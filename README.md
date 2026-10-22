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

## Build the macOS app (.dmg)

```bash
npm run make       # → out/make/dmg/arm64/Exam Proctor-<version>-arm64.dmg
```

The app is ad-hoc signed, not notarized. On another Mac: open the DMG, drag the app to
Applications, then right-click → Open the first time (or `xattr -dr com.apple.quarantine "/Applications/Exam Proctor.app"`).
macOS asks for camera, microphone and Screen Recording permission on first use.

## Tests

```bash
npm test           # unit tests: audio, face rule, integrity, hash chain, dHash, app scan
npm run e2e        # whole flow in a hidden window, fake camera/mic (needs `npm run dev`)
npm run e2e:dist   # same, against the production build over app:// with the CSP
node scripts/e2e.mjs --shots <dir>   # also saves a screenshot of every screen
```

## Structure

```
app/main.js       Electron main process (window lock, checks, evidence, IPC handlers)
app/preload.cjs   contextBridge — the only API the renderer can call (window.proctor)
app/evidence.js   hash-chained log + dHash screen diff
app/processes.js  restricted-app scan
src/              React renderer: Details → Setup → Rules → Exam → Result (Shell = brand bar + steps)
src/assets/logo.svg  the logo; `npm run icon` renders build/icon.png + build/icon.icns from it
src/exam.js       questions + rule timings (your knobs)
src/audio.js      background-audio detectors
src/face.js       MediaPipe face check + no-face / multiple-faces rule
src/integrity.js  time-decayed integrity score
scripts/e2e.mjs   end-to-end run over the DevTools protocol
forge.config.js   packaging: DMG, fuses, ad-hoc signing
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
| `captureScreen()` | `capture-screen` | UI → main | Screenshots displays; skips unchanged ones (dHash), forced every 60 s |
| `log(entry)` | `log` | UI → main | Appends a hash-chained line to `events.jsonl` |
| `saveAnswers(answers)` | `save-answers` | UI → main | Autosave to `answers.json` |
| `sessionReport()` | `session-report` | UI → main | Chain check + all events (result screen) |
| `openSession()` | `open-session` | UI → main | Opens the session folder in Finder |
| `onQuitAttempt(cb)` | `quit-attempt` | main → UI | Cmd+Q / close during the exam |
| `onEvent(cb)` | `proctor-event` | main → UI | Every logged event (feeds the integrity meter) |

## Session folder

`<chosen folder>/exam-<timestamp>/` holds `camera-*.jpg`, `screen-*.jpg`, `answers.json` and `events.jsonl`.
Each log line has `prev` + `hash` (SHA-256 chain — catches edits, not a full rewrite; needs server anchoring). Unchanged screenshots are skipped (logged as `screen-skipped`) but one is forced every 60 s. Main logs focus, shortcuts, idle, displays, start/end itself.

## Security

- Production build served from `app://bundle` (never outside `dist/`), strict CSP, no network.
- Every IPC handler rejects calls that don't come from our page; only camera/mic permission is granted.
- Navigation and pop-ups denied; packaged app exits if launched with debugger switches.
- Fuses: no `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` or `--inspect`; asar integrity + asar-only loading.
- Dev-only `PROCTOR_*` env switches (used by `scripts/e2e.mjs`) are ignored when packaged.

