import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4384,
    // Fail rather than wander. Vite's default is to take the next free port,
    // which turns a stale dev server from an error into a page at an address
    // nobody was told about — and the readme writes this port down, so a
    // moving one makes the readme wrong.
    strictPort: true,
  },
})
