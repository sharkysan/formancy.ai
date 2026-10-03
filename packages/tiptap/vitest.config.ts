import { defineConfig } from 'vitest/config'
import { RENDER_TIMEOUT_MS, coverage } from '../../vitest.coverage'

export default defineConfig({
  test: {
    coverage,
    // Catching a hang, not policing speed; see the note on the constant.
    testTimeout: RENDER_TIMEOUT_MS,
    include: ['src/**/*.test.ts'],
    // The editor is a DOM thing. Testing it against a real ProseMirror rather
    // than against a mock is the whole point: the schema's refusals are the
    // feature, and a mock would agree with whatever this file believed.
    environment: 'jsdom',
    passWithNoTests: true,
  },
})
