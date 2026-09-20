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
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
    },
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['src/test-setup.ts'],
  },
})
