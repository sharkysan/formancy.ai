import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  format: ['esm'],
  // No JSDoc in the JavaScript: the declarations carry it to an editor (§9.3).
  outputOptions: { comments: { jsdoc: false, legal: true, annotation: true } },
  dts: true,
  clean: true,
  // `main.mjs` is the bin an MCP client launches. Without this the shebang
  // survives but the file is not executable, and the client reports that it
  // could not start the server rather than why.
  shims: true,
})
