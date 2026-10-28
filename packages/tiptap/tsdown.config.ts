import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // No JSDoc in the JavaScript: the declarations carry it to an editor (§9.3).
  outputOptions: { comments: { jsdoc: false, legal: true, annotation: true } },
  dts: true,
  clean: true,
})
