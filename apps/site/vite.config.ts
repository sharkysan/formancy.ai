import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { CSS_TARGET } from '../../css-target'
import { countDecisionRecords, countFieldTypes, packageVersion } from './decision-records'

export default defineConfig({
  plugins: [react()],
  define: {
    __DECISION_RECORDS__: countDecisionRecords(),
    __FIELD_TYPES__: countFieldTypes(),
    __PACKAGE_VERSION__: JSON.stringify(packageVersion()),
  },
  build: {
    // Not Vite's default, which rewrites `:dir(rtl)` as a list of languages (0123).
    cssTarget: CSS_TARGET,
    assetsInlineLimit: 0,
    rolldownOptions: { input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      templates: fileURLToPath(new URL('./templates/index.html', import.meta.url)),
    } },
  },
  server: {
    port: 4384,
    // Fail rather than wander. Vite's default is to take the next free port,
    // which turns a stale dev server from an error into a page at an address
    // nobody was told about — and the readme writes this port down, so a
    // moving one makes the readme wrong.
    strictPort: true,
  },
})
