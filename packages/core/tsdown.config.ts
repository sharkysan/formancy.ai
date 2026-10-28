import { defineConfig } from 'tsdown'

export default defineConfig({
  // Three entries, and none imports another's code: the renderers' words (0171) are not the
  // engine's, and the server, which imports the engine, has no buttons; a summary of responses
  // (0206) is the admin's, and no form carries it.
  entry: ['src/index.ts', 'src/words.ts', 'src/summary.ts'],
  format: ['esm'],
  // No JSDoc in the JavaScript: the declarations carry it to an editor, and in the bundle it was a
  // third of what a consumer downloads (§9.3). Legal comments and pure annotations stay.
  outputOptions: { comments: { jsdoc: false, legal: true, annotation: true } },
  dts: true,
  clean: true,
})
