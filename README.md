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
# Desktop_Application
