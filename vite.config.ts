import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Base path:
 * - GitHub Pages workflow sets VITE_BASE_PATH=/air-draw-3d/
 * - Vercel and local dev use / (default)
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'gh-pages-404',
      closeBundle() {
        if (process.env.VITE_BASE_PATH !== '/air-draw-3d/') return
        const outDir = join(process.cwd(), 'dist')
        const indexHtml = join(outDir, 'index.html')
        if (existsSync(indexHtml)) {
          copyFileSync(indexHtml, join(outDir, '404.html'))
        }
      },
    },
  ],
  base: process.env.VITE_BASE_PATH ?? '/',
})
