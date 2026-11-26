import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { CSS_TARGET } from '../../css-target.ts'
import { countDecisionRecords, countFieldTypes, packageVersion } from './decision-records.ts'

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
    rolldownOptions: {
      // Every page of the site. `pnpm build` then runs `vite build --ssr src/render.tsx`,
      // which builds from that entry instead of these inputs, and `prerender.mjs` writes its
      // markup into each of these pages: the product pages first (0242), and all of them
      // since (0243).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        templates: fileURLToPath(new URL('./templates/index.html', import.meta.url)),
        angular: fileURLToPath(new URL('./angular-form-builder/index.html', import.meta.url)),
        // The paid modules' product pages (0242).
        'products-data': fileURLToPath(new URL('./products/data/index.html', import.meta.url)),
        'products-report': fileURLToPath(new URL('./products/report/index.html', import.meta.url)),
        'products-health': fileURLToPath(new URL('./products/health/index.html', import.meta.url)),
      },
    },
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
