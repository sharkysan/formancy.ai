import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import js from '@eslint/js'
import { defineConfig, includeIgnoreFile } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import { isAbsolute, resolve } from 'node:path'
import tseslint from 'typescript-eslint'

/**
 * The lint rules and the format the formancy repositories share, published
 * by formancy.ai as `@formancy/code-style`: formancy.ai lints itself with
 * it from its workspace, and Formancy Health and Formancy Data pin a
 * release exactly. Each calls it with its own paths. Written for Formancy
 * Health (formancy.ai-health 0017) and moved here, where a rule is now
 * changed, reaching the others by a release and a bump of each pin. Nothing
 * here names a path of one repository; a reason that holds for one alone is
 * written where that one calls it.
 *
 * The rules are @eslint/js's recommended set and typescript-eslint's
 * type-aware one, every rule `error` or `off`: a warning is a finding
 * nobody has to fix. `code-style.test.mjs`, beside this file, holds what
 * each rule and each path does; a repository's own guard holds what it
 * passes, and that every file it holds is linted and formatted by them.
 */

const TYPESCRIPT = ['ts', 'tsx', 'mts', 'cts']
const JAVASCRIPT = ['js', 'jsx', 'mjs', 'cjs']
const filesOf = (extensions) => `**/*.{${extensions.join(',')}}`

/**
 * TypeScript's extensions, then JavaScript's: every file ESLint lints and
 * Prettier formats, one list, so that neither reads a file the other does
 * not.
 */
export const EXTENSIONS = [...TYPESCRIPT, ...JAVASCRIPT]

/** The same, as the glob a repository's `format` and `format:check` scripts hand Prettier. */
export const FILES = filesOf(EXTENSIONS)

/**
 * Prettier's options, and its defaults otherwise. Of the widths measured,
 * 160 columns rewrote the fewest lines (formancy.ai-health 0017), and one
 * width across the four repositories is the point. Code embedded in a
 * string is left as written: Prettier reflowed an Angular component's
 * inline template, whose whitespace renders (formancy.ai-health 0017).
 */
export const prettierConfig = { semi: false, singleQuote: true, trailingComma: 'all', printWidth: 160, embeddedLanguageFormatting: 'off' }

/**
 * Unused names fail unless they begin with `_` -- arguments, variables,
 * caught errors, destructured array elements -- the convention the
 * repositories already had. Both base sets name an unused-variable rule;
 * typescript-eslint's recommended set turns @eslint/js's off, in
 * JavaScript as in TypeScript, so there is one rule and one report per
 * finding.
 */
const UNUSED_NAMES = {
  args: 'all',
  argsIgnorePattern: '^_',
  vars: 'all',
  varsIgnorePattern: '^_',
  caughtErrors: 'all',
  caughtErrorsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_',
}

/**
 * Off in a test alone: a test reads an untyped body on purpose, and vitest
 * is handed methods to `expect`. `no-explicit-any` is off there for the same
 * reason as the `no-unsafe-*` family: a test types the untyped body it
 * reads as `any` (seven disables in formancy.ai-data's lint fixes quoted it
 * word for word); source is still held to it. Nothing else is relaxed, and
 * test support -- a corpus, a package's test helpers -- is held to every
 * rule.
 */
const TEST_RELAXATIONS = {
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
}

/**
 * `only-throw-error` allows throwing a value typed `any` or `unknown` by
 * default, and rejecting with the same forwarded value is the same act, so
 * `prefer-promise-reject-errors` allows it too, everywhere: a signal's
 * `reason`, a driver's rejection passed on (nine disable comments in
 * formancy.ai-data's lint fixes gave exactly that reason). A rejection with
 * a known non-Error value, a string or object literal, is still refused.
 */
const REJECT_ERRORS = ['error', { allowThrowingAny: true, allowThrowingUnknown: true }]

/**
 * `require-await` is off everywhere, not in tests alone: an `async` function
 * with no `await` is how a synchronous implementation of an asynchronous
 * contract keeps its throws as rejections, and the rule cannot tell that
 * from an `async` left behind by a refactor. Every repository met it where
 * the contract is async and the body is not. formancy.ai-data, measured on
 * 30 October 2026: 220 findings, 201 of them in tests (`fetch: async () =>
 * new Response(...)`, `readFile: async (p) => ...`), the other 19 Fastify
 * handlers and hooks and test support. formancy.ai, the same day: 68
 * findings left after every other rule was fixed, all in test-support
 * implementations of Promise-returning ports outside test files, each of
 * which throws, so that `async` gives the rejection the real port gives and
 * `Promise.resolve` would change what the code under test meets. A forgotten
 * `await` is still caught by `no-floating-promises` and
 * `no-misused-promises`; what is no longer reported anywhere is a pointless
 * `async` a refactor left behind.
 */
const NO_REQUIRE_AWAIT = 'off'

/**
 * The ESLint configuration for one repository, given its paths:
 *
 * - `root`, absolute: the repository, which the other paths are read from;
 * - `project`: the tsconfigs that type its TypeScript, by glob -- those its
 *   typecheck runs, so that a package added is linted with types without
 *   an edit;
 * - `ignoreFiles`: its `.gitignore` files, each read for its own directory,
 *   as git reads it; build output, coverage and test results are ignored
 *   besides;
 * - `tests`: its test files, which alone are relaxed;
 * - `untyped`: TypeScript that none of its tsconfigs holds, linted without
 *   types as JavaScript is;
 * - `browser`: files that drive a page, whose callbacks run there, and know
 *   the page's globals beside Node's;
 * - `react`: its React components and hooks.
 *
 * The first four are required: one left out would lint otherwise than the
 * repository holds -- without `tests`, every file would be relaxed -- so it
 * is refused here. The last three may be empty.
 */
export function eslintConfig({ root, project, ignoreFiles, tests, untyped = [], browser = [], react = [] }) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new TypeError('code-style: root must be an absolute path')
  for (const [name, globs] of Object.entries({ project, ignoreFiles, tests })) {
    if (!Array.isArray(globs) || globs.length === 0) throw new TypeError(`code-style: ${name} must name at least one path`)
  }
  return defineConfig(
    includeIgnoreFile(
      ignoreFiles.map((file) => resolve(root, file)),
      { gitignoreResolution: true },
    ),
    { ignores: ['**/dist/**', '**/coverage/**', '**/test-results/**'] },
    {
      linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
    },
    {
      // typescript-eslint's documented pairing: its type-aware set on every
      // file, and its typed half turned off below where nothing types the
      // file, so that JavaScript is held to its rules that need no types --
      // an expression whose value is dropped, an assertion missing its call
      // among them -- as TypeScript is. Its overrides of @eslint/js's rules
      // that the compiler holds apply to TypeScript alone.
      files: [FILES],
      extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
      languageOptions: { parserOptions: { project, tsconfigRootDir: root } },
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', UNUSED_NAMES],
        '@typescript-eslint/prefer-promise-reject-errors': REJECT_ERRORS,
        '@typescript-eslint/require-await': NO_REQUIRE_AWAIT,
      },
    },
    {
      // JavaScript, and TypeScript that no tsconfig holds, are linted without
      // types, and run in Node: no-undef stays on for JavaScript, and is
      // what is left to catch a misspelt name in a script before the one run
      // that reaches it fails.
      files: [filesOf(JAVASCRIPT), ...untyped],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    // A page.evaluate callback runs in the page.
    ...(browser.length === 0 ? [] : [{ files: browser, languageOptions: { globals: { ...globals.node, ...globals.browser } } }]),
    {
      // The products speak several languages, whose typography puts narrow
      // spaces in strings and templates; between two tokens of code the
      // same character is an invisible bug.
      rules: { 'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true }] },
    },
    // The two rules a hook's caller breaks, and not react-hooks 7's whole
    // recommended set, which adds the React Compiler's.
    ...(react.length === 0
      ? []
      : [{ files: react, plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' } }]),
    // A disable comment says why, after `--`: a bare one hides a finding
    // without a reason. One that disables nothing is an error above.
    eslintComments.recommended,
    { rules: { '@eslint-community/eslint-comments/require-description': 'error' } },
    { files: tests, rules: TEST_RELAXATIONS },
  )
}
