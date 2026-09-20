import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4382,
    // The server has no CORS on purpose (SP-6 owns cross-origin policy);
    // in development the admin reaches it through this same-origin proxy.
    proxy: { '/api': { target: 'http://localhost:4380', changeOrigin: true, rewrite: (p) => p.slice('/api'.length) } },
  },
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true },
})
