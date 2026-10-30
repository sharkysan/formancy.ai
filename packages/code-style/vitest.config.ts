import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage.ts'

export default defineConfig({
  test: {
    // The repository's policy, with its globs read for JavaScript: this package's
    // one module is `.mjs`, which the policy's TypeScript globs would not count,
    // and a report of no file would read as a package nobody tests.
    coverage: { ...coverage, include: ['src/**/*.mjs'], exclude: ['src/**/*.test.mjs'] },
    include: ['src/**/*.test.mjs'],
  },
})
