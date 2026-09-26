import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage'

export default defineConfig({
  test: {
    coverage,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    passWithNoTests: true,
    // Every test renders the whole playground into jsdom, and the first one in
    // the file also pays for the cold start. On a loaded CI runner that has
    // taken more than the default five seconds with nothing wrong.
    testTimeout: 20_000,
  },
})
