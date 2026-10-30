import { eslintConfig } from '@formancy/code-style'
import { globalIgnores } from 'eslint/config'

/**
 * The repository's lint rules: the formancy repositories' shared ones,
 * `@formancy/code-style` (0225), given formancy.ai's paths.
 * `apps/docs/src/lint.test.ts` holds what is passed here.
 */
export default [
  // Written by packages/spec/scripts/generate-validator.mjs from the schema,
  // in a form nobody reads; .prettierignore leaves it too.
  globalIgnores(['packages/spec/src/generated/document-validator.js']),
  ...eslintConfig({
    root: import.meta.dirname,
    // The tsconfigs `pnpm typecheck` runs, by glob, so that a new package or
    // app is linted with types without an edit here; tsconfig.tools.json
    // brings the vitest, Vite and tsdown configs into the typecheck. The
    // Angular packages' tsconfig.spec.json is not named: it is the Angular
    // compiler's, over the same files tsconfig.json holds, tests among them.
    project: ['./packages/*/tsconfig.json', './apps/*/tsconfig.json', './tsconfig.tools.json'],
    // Prettier reads the root's and .prettierignore alone, so what the
    // second says is repeated in .prettierignore.
    ignoreFiles: ['.gitignore', 'apps/docs/.gitignore'],
    tests: ['**/*.{test,spec}.{ts,tsx,mts,cts,js,mjs}'],
    // The install fixtures import the packed tarballs, which the workspace
    // does not resolve; the install gates type-check them, in the consumer
    // projects that have them.
    untyped: ['scripts/install-fixture/**', 'scripts/angular-install-fixture/**'],
    // The scripts that drive Playwright.
    browser: ['scripts/*browser-test.mjs', 'scripts/angular-install-test.mjs'],
    react: ['packages/react/**/*.{ts,tsx}', 'packages/builder-react/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}', 'apps/playground/**/*.{ts,tsx}', 'apps/site/**/*.{ts,tsx}'],
  }),
]
