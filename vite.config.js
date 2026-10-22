import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Strict CSP for the production build only (dev needs Vite's inline HMR script).
// 'wasm-unsafe-eval' lets MediaPipe compile its wasm; nothing may load from the network.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const cspInProduction = {
  name: 'csp-in-production',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  plugins: [react(), cspInProduction],
  assetsInclude: ['**/*.tflite'], // MediaPipe face model
  base: './', // relative asset paths so dist/ loads over file:// in the packaged app
  server: { port: 5173, strictPort: true },
})
