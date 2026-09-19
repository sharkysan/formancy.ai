import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 4381 },
  test: { passWithNoTests: true, include: [] },
})
