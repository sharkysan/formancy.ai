import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
    },
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Container start dominates; the tests themselves are quick.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
