import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://sining-neo.github.io/air-draw-3d/
const GITHUB_PAGES_BASE = '/air-draw-3d/'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'gh-pages-404',
      closeBundle() {
        const outDir = join(process.cwd(), 'dist')
        const indexHtml = join(outDir, 'index.html')
        if (existsSync(indexHtml)) {
          copyFileSync(indexHtml, join(outDir, '404.html'))
        }
      },
    },
  ],
  base:
    process.env.VITE_BASE_PATH ??
    (process.env.NODE_ENV === 'production' ? GITHUB_PAGES_BASE : '/'),
})
