import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/validate.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
