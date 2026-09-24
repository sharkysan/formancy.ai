import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4382,
    // Fail rather than wander: the readme writes this port down, and a moved
    // admin is a second one running against the same API without saying so.
    strictPort: true,
    // The server has no CORS on purpose (SP-6 owns cross-origin policy);
    // in development the admin reaches it through this same-origin proxy.
    proxy: { '/api': { target: 'http://localhost:4380', changeOrigin: true, rewrite: (p) => p.slice('/api'.length) } },
  },
  test: {
    include: ['src/**/*.test.ts'], passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
    },
  },
})
