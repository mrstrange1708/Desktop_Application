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
- [x] IPC bridge design: channel table in README
- [x] Lockdown window: kiosk/fullscreen, always-on-top, `setContentProtection(true)`
- [x] Block shortcuts (all Cmd/Ctrl combos + F-keys during exam) and copy/cut/paste/right-click/select
- [x] Focus loss → 3 s grace → UFM
- [x] Quit attempt (Cmd+Q / close) → 5 s return countdown → UFM; second attempt = UFM
- [x] Audio: loudness + speech-band + music (spectral flatness) detectors, 3rd warning = UFM
- [x] Setup screen (evidence folder, camera+mic, screen capture) → rules → exam → result/UFM
- [x] Camera + screen evidence every 10 s, events.jsonl log in the session folder
- [x] Hash-chain the event log (unkeyed — needs server anchoring, see below)

## Day 2 — Pre-checks + Monitoring
- [x] System check: single display + restricted apps (setup screen, re-checked by main at start)
- [x] Screenshots de-duplicated with dHash (only saved when the screen changed)
- [x] Paste blocked (Day 1); idle > 120 s logged via `powerMonitor`; display plugged in mid-exam logged
- [x] Integrity score engine (half-life decay) + live meter + lowest score on result
- [x] Result screen verifies the log chain
- [ ] Keystroke dynamics — skipped: exam is MCQ-only, no typing to measure. Revisit if we add written answers
- [ ] Server anchoring: send final log hash + entry count with the submission (backend)

## Day 3 — Exam flow + Polish + Ship
- [x] Exam UI: questions, countdown timer, auto-submit at time-up, autosave (`answers.json`)
- [x] Face detection: MediaPipe on-device; no face 5 s / 2+ faces 2 s → warning, 3rd = UFM
- [x] Post-exam report: integrity graph, event timeline, chain check, open session folder
- [x] Security pass: app:// origin, CSP, IPC origin guard, permission handler, fuses, no debugger
- [x] Package with electron-forge → DMG (ad-hoc signed)
- [x] End-to-end run: `npm run e2e` / `npm run e2e:dist`
- [ ] Auto-submit on low integrity — not decided; score is informational today
- [ ] Developer ID signing + notarization (needs an Apple developer account)
- [ ] Windows build (maker-squirrel) — not set up
- [ ] Server: grading, answer key off the client, log anchoring (backend)
