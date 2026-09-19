import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Container start dominates; the tests themselves are quick.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
