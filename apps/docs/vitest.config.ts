import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage'

/**
 * The docs app has no unit-testable code — Astro builds it — so this exists for
 * one kind of test: the documentation's claims about the repository, checked
 * against the repository.
 *
 * `node` rather than `jsdom` because those tests read files.
 *
 * Those files are all over the repository, and turbo hashes a task on its own package —
 * so these were CACHED while the thing they check changed underneath. `turbo.json` beside
 * this file turns caching off for them: a guard that does not run is a comment, and one
 * that runs only when its own directory changes is a guard on the wrong directory.
 */
export default defineConfig({
  test: {
    coverage,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
