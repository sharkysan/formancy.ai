import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { coverage } from '../../vitest.coverage'

/**
 * The Angular tsconfig, resolved when the plugin asks rather than when this
 * module loads.
 *
 * `tsconfig` accepts a thunk, and that is load-bearing here: `build-base.test.ts`
 * imports this config to assert the base path, and under Vitest's transform
 * `import.meta.url` is not a file URL — so resolving it eagerly threw *"The URL
 * must be of scheme file"* and took a test about one string with it.
 */
const TSCONFIG = (): string =>
  fileURLToPath(new URL('./tsconfig.angular.json', import.meta.url))

export default defineConfig({
  /*
   * The same Angular plugin the build uses, for the same reason and with the
   * same narrowing.
   *
   * This config is separate from `vite.config.ts`, so adding the plugin there
   * did nothing here: the suite loaded `@formancy/angular` untransformed and
   * every file that mounts the app failed with *"needs to be compiled using the
   * JIT compiler"*.
   */
  plugins: [
    // React first, and both are required: with only the Angular plugin the
    // `.tsx` suites stopped parsing at all — *"Cannot use import statement
    // outside a module"* — because nothing was transforming the JSX any more.
    react(),
    angular({
      tsconfig: TSCONFIG,
      transformFilter: (_code, id) =>
        [
          'angular-preview',
          'angular-builder-host',
          '@formancy/angular',
          '@formancy/builder-angular',
        ].some((part) => id.includes(part)),
    }),
  ],
  test: {
    coverage,
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    passWithNoTests: true,
    // Every test renders the whole playground into jsdom, and the first one in
    // the file also pays for the cold start. On a loaded CI runner that has
    // taken more than the default five seconds with nothing wrong.
    testTimeout: 20_000,
  },
})
