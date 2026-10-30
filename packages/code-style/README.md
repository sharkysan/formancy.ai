<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/code-style

The lint rules and the format the formancy repositories share: an ESLint
configuration and Prettier's options, in one JavaScript module that each
repository calls with its own paths. It names no path of any repository, so
the repositories hold one set of rules and one style without a copy each.

## Use

```bash
npm install --save-dev @formancy/code-style eslint prettier typescript
```

ESLint, Prettier and TypeScript are peers: a repository installs them at
versions of its own, inside the ranges the manifest declares, each of which
starts at the version this package's suite runs.

`eslint.config.mjs`:

```js
import { eslintConfig } from '@formancy/code-style'

export default eslintConfig({
  root: import.meta.dirname,
  project: ['./packages/*/tsconfig.json'],
  ignoreFiles: ['.gitignore'],
  tests: ['**/*.test.{ts,tsx,mjs}'],
})
```

`prettier.config.mjs`:

```js
export { prettierConfig as default } from '@formancy/code-style'
```

`FILES` is the glob a repository's `format` and `format:check` scripts hand
Prettier, and `EXTENSIONS` its extensions: TypeScript's and JavaScript's, so
that neither tool reads a file the other does not.

## The paths a repository passes

The module's doc comment on `eslintConfig` is the reference; in short:

- **`root`**, absolute: the repository, which the other paths are read from.
- **`project`**: the tsconfigs that type its TypeScript, by glob.
- **`ignoreFiles`**: its `.gitignore` files, each read for its own directory, as
  git reads it. Build output, coverage and test results are ignored besides.
- **`tests`**: its test files, which alone are relaxed.
- **`untyped`**: TypeScript no tsconfig holds, linted without types.
- **`browser`**: files that drive a page, which know the page's globals.
- **`react`**: its React components and hooks.

The first four are required, and a call without one is refused where the
configuration is made: without `tests`, every file would be relaxed. A
repository's own exception, such as a generated file, is written where it calls
this, as a `globalIgnores` beside it and a line in `.prettierignore`, and never
in the module.

## What it holds

- **The rules** are `@eslint/js`'s recommended set and typescript-eslint's
  type-aware one, every rule an error or off: a warning is a finding nobody has
  to fix. A name may go unused only if it begins with `_`. A disable comment
  says why after `--`, and one that disables nothing is an error. A typographic
  space is allowed in a string, a template and JSX text, and refused between two
  tokens. Where `react` points, a hook may not run under a condition or miss a
  dependency.
- **A test is relaxed** for the `no-unsafe-*` rules, `unbound-method` and
  `require-await` alone, and held to everything else.
- **The format** is Prettier's defaults but four: no semicolons, single quotes,
  trailing commas wherever they are allowed, and 160 columns.

It ships no type declarations: a repository imports it from a JavaScript
configuration file.

## Where it comes from

The module and its test, `src/code-style.mjs` and `src/code-style.test.mjs`,
were written for Formancy Health (formancy.ai-health 0017) and are carried here
byte for byte; the repositories that copied them pin this package in their place
once it is released. The test is this package's suite. It lints a repository of
its own, written to the system's temporary directory, and holds that each rule
runs at error on the kind of file it is for and that each path does what it
says. It does not hold that what a rule reports is a defect.

`pnpm test:e2e:install` installs the packed tarball with its dependencies and
peers into a project outside the workspace, and lints and formats a file there
with it.
