import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const api = process.env.COLE_API ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Simulator renderers live next to their plugin, outside the core app (doc 06 §9).
      '@simulators': fileURLToPath(new URL('../../simulators', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['..', '../../simulators'] },
    proxy: {
      '/api': { target: api, changeOrigin: false, ws: true },
    },
  },
})
