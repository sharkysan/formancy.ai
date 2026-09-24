import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The playground is served from a subdirectory, and has to be built knowing it.
 *
 * formancy.ai is one static deployment: the site at `/`, this app copied into
 * `/playground/`. Vite writes ABSOLUTE asset URLs by default, so a playground
 * built with the default base asks for `/assets/index-<hash>.js` — the
 * SITE's asset directory, which holds the site's chunks under different
 * hashes. The page loads, the script 404s, and the result is a blank screen
 * with nothing in the build log to explain it.
 *
 * Only on build. The dev server is its own origin on :4381, where the app is
 * at the root and a base would only make the URL longer.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/playground/' : '/',
  plugins: [react()],
  // Fail rather than wander: the readme writes this port down, and Vite's
  // default of taking the next free one turns a stale dev server from an
  // error into a page at an address nobody was told about.
  server: { port: 4381, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
    },
  },
}))
