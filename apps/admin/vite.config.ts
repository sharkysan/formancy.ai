import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { monacoFromThisSite } from '../../monaco-from-this-site'
import { MONACO_VS } from './src/monaco-path'

export default defineConfig({
  plugins: [react(), monacoFromThisSite(MONACO_VS)],
  server: {
    port: 4382,
    // Fail rather than wander: the readme writes this port down, and a moved
    // admin is a second one running against the same API without saying so.
    strictPort: true,
    // The server has no CORS on purpose (SP-6 owns cross-origin policy);
    // in development the admin reaches it through this same-origin proxy.
    //
    // `127.0.0.1` and never `localhost`: the server binds `0.0.0.0`, which is IPv4 only,
    // while Node resolves `localhost` to `::1` first on Windows. The proxy then answers
    // 502 for every call and the admin shows an empty list of forms with nothing saying
    // why -- measured, not guessed: `curl` against the IPv4 address answered 401 and
    // against `[::1]` answered nothing at all.
    proxy: { '/api': { target: 'http://127.0.0.1:4380', changeOrigin: true, rewrite: (p) => p.slice('/api'.length) } },
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
