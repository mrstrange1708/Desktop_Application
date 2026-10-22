import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.tflite'], // MediaPipe face model
  base: './', // relative asset paths so dist/ loads over file:// in the packaged app
  server: { port: 5173, strictPort: true },
})
