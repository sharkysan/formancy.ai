import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vitest/config'
import { RENDER_TIMEOUT_MS, coverage } from '../../vitest.coverage.ts'

export default defineConfig({
  resolve: {
    // The Material entry imports the renderer by its package name, as a consumer does.
    // In these tests that name is this source, or the registry token Material provides
    // and the form reading it would be two different objects -- one from dist, one from
    // here -- and nothing Material drew would ever be asked for.
    alias: { '@formancy/angular': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  plugins: [
    angular({
      // Absolute, because the plugin otherwise guesses tsconfig.spec.json
      // relative to a root that shifts between vite, vitest and turbo.
      tsconfig: fileURLToPath(new URL('./tsconfig.spec.json', import.meta.url)),
    }),
  ],
  test: {
    coverage,
    /*
     * Rendering an Angular component tree in jsdom is real work, and the 5s
     * default was never chosen for it.
     *
     * Measured: the first `render(FormancyForm, …)` in a file compiles the form
     * and everything the registry pulls in — seventeen field components — and
     * costs 372ms locally against 4–30ms for a test that renders a small host.
     * On a shared CI runner under parallel load that same test was observed at
     * **5,396ms**, which is a factor of about fourteen, and it turned main red
     * the day a fifteenth package joined the parallel build.
     *
     * The same suites that already render real trees — `apps/playground` and
     * `apps/site` — moved off the default long ago; these two were left on it.
     * A timeout is here to catch a HANG, and speed is policed by the
     * performance gate in `pnpm bench`, not by this number.
     */
    testTimeout: RENDER_TIMEOUT_MS,
    /*
     * Child processes, not the Analog plugin's `vmThreads` default. A worker thread has its
     * own copy of `process.env`, so `vi.stubEnv('TZ', …)` never reaches the clock there: the
     * typed datetime control is shown on the wall clock of the person, and a test that pins a
     * zone and silently reads the machine's own passes or fails by where it is run. Measured:
     * under `vmThreads` a `Date` stayed in the machine's zone after the stub; under `forks` it
     * moved.
     */
    pool: 'forks',
    include: ['src/**/*.test.ts', 'material/src/**/*.test.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['src/test-setup.ts'],
  },
})
