import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage.ts'

export default defineConfig({
  test: {
    coverage,
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // `agreement.test.ts` runs the TypeScript compiler over the printed type: about a second
    // alone, and past the default five under a full parallel run, where it timed out. The
    // work is real; the limit says so once, for the package, rather than per test.
    testTimeout: 30_000,
  },
})
