import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // packages/brand owns the brand assets; serving them straight from there (rather than a copy
  // under apps/web/public) keeps a single source of truth for the favicon and touch icon.
  publicDir: fileURLToPath(new URL('../../packages/brand/assets', import.meta.url)),
  build: { outDir: '../hub/public', emptyOutDir: true },
})
