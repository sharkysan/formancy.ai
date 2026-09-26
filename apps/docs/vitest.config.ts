import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage'

/**
 * The docs app has no unit-testable code — Astro builds it — so this exists for
 * one kind of test: the documentation's claims about the repository, checked
 * against the repository.
 *
 * `node` rather than `jsdom` because those tests read files.
 */
export default defineConfig({
  test: {
    coverage,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
