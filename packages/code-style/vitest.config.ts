import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage.ts'

export default defineConfig({
  test: {
    // The repository's policy, with its globs read for JavaScript: this package's
    // one module is `.mjs`, which the policy's TypeScript globs would not count,
    // and a report of no file would read as a package nobody tests.
    coverage: { ...coverage, include: ['src/**/*.mjs'], exclude: ['src/**/*.test.mjs'] },
    include: ['src/**/*.test.mjs'],
    // A case that lints with types has typescript-eslint build a TypeScript program
    // first, which is real work. On 30 October 2026, on an Apple M2, the whole suite
    // took 1.0 s alone, and *a floating promise fails* took 9.4 s, failing the 5 s
    // default, while every package's suite ran at once at a load average of 12.9:
    // the limit measured the machine, not the rule. 30 s, which apps/docs allows for
    // the same kind of work, is here to catch a hang.
    testTimeout: 30_000,
  },
})
