import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vitest/config'
import { RENDER_TIMEOUT_MS, coverage } from '../../vitest.coverage'

export default defineConfig({
  plugins: [angular({ tsconfig: fileURLToPath(new URL('./tsconfig.app.json', import.meta.url)) })],
  test: {
    coverage,
    // Mounting the builder and a Material form is real work in jsdom; the timeout is for a hang.
    testTimeout: RENDER_TIMEOUT_MS,
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
})
