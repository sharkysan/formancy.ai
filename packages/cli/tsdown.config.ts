import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // `main.mjs` is the `formancy` bin. Without this the shebang survives but the file is
  // not executable, and `npx formancy` fails with a permission error rather than running.
  shims: true,
})
