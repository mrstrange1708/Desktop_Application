# Build Plan — 3 Days

Each step is planned + reviewed before coding. Order may shift to match lectures.

## The hook: what makes this different

Most student proctoring apps = "webcam on + block Ctrl+C + screenshot every 5s".
We go further with four ideas that are cheap to build but look serious:

1. **Integrity Score engine (time-decayed risk score)** — every event (tab blur, paste,
   second face, extra monitor, …) has a weight. Score = Σ weight · e^(−λ·age).
   One slip fades; repeated slips stack. Thresholds → warn → final warning → auto-submit.
   Replaces binary "flagged / not flagged" with a live 0–100 meter.
2. **Tamper-evident audit log (hash chain)** — each logged event stores
   `sha256(prevHash + event)`. Editing or deleting any line breaks the chain, so the
   evidence file is verifiable. Node `crypto` only, no deps.
3. **Smart capture with perceptual hashing (dHash)** — take screenshots often, but only
   save when the screen *actually changed* (Hamming distance > threshold).
   Less storage, more coverage, and a "screen changed X times" stat.
4. **Keystroke dynamics** — calibrate typing rhythm at start (inter-key timing), then
   flag z-score outliers: paste-like bursts or a different person typing.

Stretch: on-device face detection (MediaPipe) for 0 / 2+ faces & looking away,
mic loudness spikes (Web Audio RMS), post-exam HTML timeline report.

## Day 1 — Foundation + Lockdown
- [x] Tech stack, folders, git, GitHub, Electron + Vite running, IPC smoke test
- [ ] IPC bridge design: list every main ⇄ renderer channel up front
- [ ] Lockdown window: kiosk/fullscreen, always-on-top, `setContentProtection(true)`
      (blocks other apps from screen-recording the exam), no menu / devtools in prod
- [ ] Block shortcuts: copy/paste, Cmd+Tab/Alt+Tab attempts, Cmd+Q, reload, devtools
- [ ] Focus loss detection: window `blur`, minimize, leave-fullscreen events
- [ ] Event logger in main (hash-chained, writes JSONL to userData)

## Day 2 — Pre-checks + Monitoring
- [ ] Pre-exam checklist screen: camera, mic, screen permission, single display
      (`screen.getAllDisplays()`), no blacklisted apps running (process list)
- [ ] Periodic camera snapshot + screenshot (desktopCapturer) with dHash de-dup
- [ ] Clipboard watch + paste detection, idle detection (`powerMonitor`)
- [ ] Integrity Score engine + live meter + warning modals
- [ ] Keystroke dynamics: calibration step + outlier flagging

## Day 3 — Exam flow + Polish + Ship
- [ ] Exam UI: questions, countdown timer, autosave, submit / auto-submit on threshold
- [ ] Stretch: face detection, mic level
- [ ] Post-exam report: timeline of events, score graph, chain-verification result
- [ ] Security pass: CSP, sandbox, validate IPC inputs
- [ ] Package with electron-forge (dmg/exe), demo script, README screenshots
