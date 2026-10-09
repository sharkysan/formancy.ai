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
    // These tests read and parse the repository — the TypeScript compiler over a package,
    // brotli over three bundles, every source file for its imports — and in CI under
    // coverage two of them took 5.4 s, past the default five, while taking under one here.
    // The work is real; the limit says so once, for the app, rather than per test.
    testTimeout: 30_000,
  },
})
