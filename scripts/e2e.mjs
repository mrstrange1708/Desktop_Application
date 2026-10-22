// End-to-end run of the real app: setup → rules → exam → result, in a hidden window with
// Chromium's fake camera/mic, driven over the DevTools protocol.
//   npm run e2e        dev build (needs `npm run dev` running)
//   npm run e2e:dist   production build through app:// with the CSP, like the packaged app
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const PORT = 9333
const DIST = process.argv.includes('--dist')
const PAGE_URL = DIST ? 'app://bundle/' : 'http://localhost:5173'
const EXAM_SECONDS = 25
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'proctor-e2e-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const env = { ...process.env, PROCTOR_TEST_FOLDER: folder, PROCTOR_NO_LOCK: '1', PROCTOR_HIDDEN: '1', PROCTOR_SKIP_APP_CHECK: '1', PROCTOR_USE_DIST: DIST ? '1' : '' }
delete env.ELECTRON_RUN_AS_NODE // set inside VS Code's extension host; makes Electron run as plain Node
const electron = spawn('./node_modules/.bin/electron', ['.', `--remote-debugging-port=${PORT}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
electron.stdout.on('data', (d) => (output += d))
electron.stderr.on('data', (d) => (output += d))

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = pages.find((p) => p.type === 'page' && p.url.startsWith(PAGE_URL))
      if (page) return new WebSocket(page.webSocketDebuggerUrl)
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('app page never appeared')
}

const ws = await connect()
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let nextId = 1
const pending = new Map()
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  pending.get(msg.id)?.(msg)
})
async function evaluate(expression) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  const msg = await new Promise((r) => pending.set(id, r))
  if (msg.result?.exceptionDetails) throw new Error(msg.result.exceptionDetails.text)
  return msg.result?.result?.value
}
const text = () => evaluate('document.body.innerText')
async function click(label) {
  for (let i = 0; i < 40; i++) {
    const ok = await evaluate(`(() => {
      const all = [...document.querySelectorAll('button, label')].filter((b) => !b.disabled)
      const want = ${JSON.stringify(label)}
      const el = all.find((b) => b.innerText.trim() === want) ?? all.find((b) => b.innerText.trim().startsWith(want))
      if (el) el.click()
      return !!el
    })()`)
    if (ok) return
    await sleep(250)
  }
  throw new Error(`no enabled "${label}"\n--- page ---\n${await text()}`)
}

try {
  await click('Choose folder')
  await click('Allow access')
  await click('Run check')
  await click('Continue to rules')
  await click('I have read the rules')
  await click('Start exam')
  await click('B') // answer question 1 (option B)
  await sleep(EXAM_SECONDS * 1000)
  const bar = await evaluate(`document.querySelector('.exam-bar').innerText`)
  await click('Submit exam')
  await click('Submit')
  await sleep(1500)
  const result = await text()

  const session = fs.readdirSync(folder).map((d) => path.join(folder, d))[0]
  const files = fs.readdirSync(session)
  const events = fs.readFileSync(path.join(session, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  console.log('exam bar:', bar.replace(/\n/g, ' | '))
  console.log('files:', files.reduce((c, f) => ({ ...c, [f.split('-')[0]]: (c[f.split('-')[0]] ?? 0) + 1 }), {}))
  console.log('events:', events.map((e) => e.type + (e.kind ? `(${e.kind})` : e.message ? `(${e.message})` : '')).join(', '))
  console.log('result:', result.split('\n').slice(0, 12).join(' | '))

  assert.ok(files.some((f) => f.startsWith('camera-')), 'camera frames saved')
  assert.ok(files.some((f) => f.startsWith('screen-')), 'screenshots saved')
  assert.ok(files.includes('answers.json'), 'answers autosaved')
  assert.match(result, /Chain intact/)
  assert.ok(!events.some((e) => e.type === 'capture-error'), 'no capture errors')
  console.log('\nE2E PASS')
} catch (error) {
  console.error('\nE2E FAIL:', error.message, '\n--- electron output ---\n' + output.slice(-3000))
  process.exitCode = 1
} finally {
  ws.close()
  electron.kill()
}
