// Renders src/assets/logo.svg into the macOS app icon: build/icon.png (1024) + build/icon.icns.
//   npm run icon
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const out = path.join(root, 'build')
const svg = fs.readFileSync(path.join(root, 'src/assets/logo.svg'), 'utf8')

// Apple's grid: 1024 canvas, 824 artwork, 100 px margin.
const html = `<style>html,body{margin:0;background:transparent}img{display:block;margin:100px;width:824px;height:824px}</style>
<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  const png = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 }).toPNG()

  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'icon.png'), png)
  const iconset = path.join(out, 'icon.iconset')
  fs.rmSync(iconset, { recursive: true, force: true })
  fs.mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(size), String(size), path.join(out, 'icon.png'), '--out', path.join(iconset, `icon_${size}x${size}.png`)])
    execFileSync('sips', ['-z', String(size * 2), String(size * 2), path.join(out, 'icon.png'), '--out', path.join(iconset, `icon_${size}x${size}@2x.png`)])
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(out, 'icon.icns')])
  fs.rmSync(iconset, { recursive: true })
  console.log('wrote build/icon.png, build/icon.icns')
  app.quit()
})
