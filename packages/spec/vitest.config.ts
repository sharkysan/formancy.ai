import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage'

export default defineConfig({
  test: {
    coverage,
    include: ['src/**/*.test.ts'],
  },
})
