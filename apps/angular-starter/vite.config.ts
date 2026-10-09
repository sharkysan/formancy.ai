import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vite'
import { CSS_TARGET } from '../../css-target'

/**
 * An Angular application built with Vite and Analog's Angular plugin — the toolchain this
 * repository's Angular packages are tested with. An Angular CLI project takes the same
 * components and providers unchanged; only this file is different.
 */
export default defineConfig({
  // Not Vite's default, which rewrites `:dir(rtl)` as a list of languages (0123).
  build: { cssTarget: CSS_TARGET },
  plugins: [
    angular({
      // A thunk: under Vitest `import.meta.url` is not a file URL until it is asked for.
      tsconfig: () => fileURLToPath(new URL('./tsconfig.app.json', import.meta.url)),
    }),
  ],
  server: { port: 4383, strictPort: true },
})
