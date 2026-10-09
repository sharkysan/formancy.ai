import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { CSS_TARGET } from '../../css-target'

/**
 * The playground is served from a subdirectory, and has to be built knowing it.
 *
 * formancy.ai is one static deployment: the site at `/`, this app copied into
 * `/playground/`. Vite writes ABSOLUTE asset URLs by default, so a playground
 * built with the default base asks for `/assets/index-<hash>.js` — the
 * SITE's asset directory, which holds the site's chunks under different
 * hashes. The page loads, the script 404s, and the result is a blank screen
 * with nothing in the build log to explain it.
 *
 * Only on build. The dev server is its own origin on :4381, where the app is
 * at the root and a base would only make the URL longer.
 */
/**
 * What the Angular compiler is pointed at, and nothing else.
 *
 * Every entry is either a file of ours that declares a component or a package
 * ng-packagr emitted in partial Ivy form, which needs the linker. Everything
 * else in this app is React, and the compiler's output for a module that
 * declares no component DROPS ITS EXPORTS — which is how a narrow-looking
 * `include` produced five `MISSING_EXPORT`s for files with nothing Angular in
 * them.
 */
const ANGULAR_SOURCES = [
  'angular-preview',
  'angular-builder-host',
  '@formancy/angular',
  '@formancy/builder-angular',
]

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

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/playground/' : '/',
  // Not Vite's default, which rewrites `:dir(rtl)` as a list of languages (0123).
  build: { cssTarget: CSS_TARGET },
  /*
   * Both frameworks, in one page.
   *
   * The Angular plugin compiles Angular's templates and runs the linker over
   * `@formancy/angular`'s published output, which ng-packagr emits in partial
   * Ivy form — without it the components carry `ɵɵngDeclareComponent` calls and
   * nothing resolves them.
   *
   * **`transformFilter`, not `include`.** The plugin's `include` is for
   * *additional* files to compile, so passing a narrow list there does not
   * narrow anything: it kept transforming every `.ts` in this app, and the
   * Angular compiler's output for a module that declares no component drops its
   * exports. The build failed with five `MISSING_EXPORT`s for
   * `STARTER_SCHEMA`, `WIZARD_SCHEMA` and friends — files with nothing Angular
   * in them at all.
   */
  plugins: [
    react(),
    angular({
      tsconfig: TSCONFIG,
      transformFilter: (_code, id) =>
        ANGULAR_SOURCES.some((part) => id.includes(part)),
    }),
  ],
  // Fail rather than wander: the readme writes this port down, and Vite's
  // default of taking the next free one turns a stale dev server from an
  // error into a page at an address nobody was told about.
  server: { port: 4381, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test-setup.ts'],
    },
  },
}))
