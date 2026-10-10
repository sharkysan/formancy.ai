import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two entries, and the second imports nothing from the first: the renderers' words
  // (0171) are not the engine's, and the server, which imports the engine, has no buttons.
  entry: ['src/index.ts', 'src/words.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
