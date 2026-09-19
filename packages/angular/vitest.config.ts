import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    angular({
      // Absolute, because the plugin otherwise guesses tsconfig.spec.json
      // relative to a root that shifts between vite, vitest and turbo.
      tsconfig: fileURLToPath(new URL('./tsconfig.spec.json', import.meta.url)),
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['src/test-setup.ts'],
  },
})
