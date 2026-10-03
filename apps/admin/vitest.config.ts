import { defineConfig } from 'vitest/config'
import { RENDER_TIMEOUT_MS, coverage } from '../../vitest.coverage'

export default defineConfig({
  test: {
    coverage,
    // Catching a hang, not policing speed; see the note on the constant.
    testTimeout: RENDER_TIMEOUT_MS,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    passWithNoTests: true,
  },
})
