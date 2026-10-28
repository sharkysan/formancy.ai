import { defineConfig } from 'tsdown'

export default defineConfig({
  // Three entries, and none imports another's code: the renderers' words (0171) are not the
  // engine's, and the server, which imports the engine, has no buttons; a summary of responses
  // (0206) is the admin's, and no form carries it.
  entry: ['src/index.ts', 'src/words.ts', 'src/summary.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
