import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ESLint } from 'eslint'
import * as prettier from 'prettier'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { EXTENSIONS, eslintConfig, prettierConfig } from './code-style.mjs'

/**
 * The shared rules, as the package formancy.ai will publish holds them:
 * that each rule runs, at error, on the kind of file it is for, and that
 * each path a repository passes does what it says.
 *
 * Copied byte for byte with code-style.mjs, so it names no path of any
 * repository. It lints a repository of its own instead, written under the
 * system's temporary directory and removed after: a tsconfig that types
 * `src/`, a .gitignore at its root and one in a directory, and the files
 * below, each a short text at a path of the kind a rule is for. All are
 * written before the first lint, which builds the program the typed rules
 * read. Each repository's own guard, beside its eslint.config.mjs, holds
 * what it passes here and that every file it holds is linted.
 *
 * What it cannot see: whether a rule's verdict is right. It holds that a
 * rule runs and fails the build, not that what it reports is a defect.
 */
const PATHS = {
  project: ['./tsconfig.json'],
  ignoreFiles: ['.gitignore', 'nested/.gitignore'],
  tests: ['**/*.test.{ts,mjs}'],
  untyped: ['untyped/**'],
  browser: ['page/**'],
  react: ['src/app/**'],
}

const NARROW_SPACE = ' '
const PARSED = "export const v: { a: number } = JSON.parse('{}')\n"
const ASSERTION = "import { expect } from 'vitest'\nexpect(1).toBeTruthy\n"
const FLOATING = 'export async function f() {}\nf()\n'
const ASYNC_DOUBLE = 'export const read = { readFile: async (_path: string) => 1 }\n'
const HOOKS = [
  "import { useEffect, useState } from 'react'",
  'export function C({ on, n }: { on: boolean; n: number }) {',
  '  if (on) {',
  '    useState(0)',
  '  }',
  '  useEffect(() => {',
  '    void n',
  '  }, [])',
  '  return null',
  '}',
  '',
].join('\n')

/** Each kind of name the underscore excuses, unused once with it and once without: an argument, an element of a destructured array, a variable, a caught error. */
const UNUSED = (type) =>
  [
    `export function f(_a${type}, b${type}) {`,
    '  const [_first, second] = [1, 2]',
    '  try {',
    '    return 1',
    '  } catch (_error) {',
    '    return 2',
    '  }',
    '}',
    'export function g() {',
    '  const _kept = 1',
    '  const dropped = 2',
    '  try {',
    '    return 1',
    '  } catch (caught) {',
    '    return 2',
    '  }',
    '}',
    '',
  ].join('\n')

const FILES = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', types: [], noEmit: true },
    include: ['src'],
  }),
  '.gitignore': 'build/\n',
  'nested/.gitignore': 'local.ts\n',
  'src/floating.ts': FLOATING,
  'src/parsed.ts': PARSED,
  'src/parsed.test.ts': PARSED + 'export async function g() {}\ng()\n',
  'src/unused.ts': UNUSED(': number'),
  'src/unused.mjs': UNUSED(''),
  'src/assertion.test.ts': ASSERTION,
  'src/assertion.test.mjs': ASSERTION,
  'src/bare-disable.ts': 'export async function f() {}\n// eslint-disable-next-line @typescript-eslint/no-floating-promises\nf()\n',
  'src/stale-disable.ts': '// eslint-disable-next-line no-console -- not needed\nexport const x = 1\n',
  'src/stale-config.ts': '/* eslint no-debugger: "error" -- already on */\nexport const x = 1\n',
  'src/undefined.mjs': 'undefinedThing()\n',
  'src/node.mjs': 'process.exitCode = 0\n',
  'src/typography.ts': `export const t = \`a${NARROW_SPACE}:\`\n`,
  'src/whitespace.ts': `export const x =${NARROW_SPACE}1\n`,
  'untyped/consume.ts': FLOATING + 'const unused = 1\n',
  'page/evaluate.mjs': 'export const title = () => document.title\n',
  'src/evaluate.mjs': 'export const title = () => document.title\n',
  'src/app/hooks.tsx': HOOKS,
  'src/outside.tsx': HOOKS + 'async function g() {}\ng()\n',
  'src/double.ts': ASYNC_DOUBLE,
  'src/double.test.ts': ASYNC_DOUBLE,
  'src/reject-forwarded.ts': 'export const fail = (reason: unknown) => new Promise<void>((_resolve, reject) => reject(reason))\n',
  'src/reject-literal.ts': "export const fail = () => Promise.reject('no')\n",
  'src/any.ts': 'export const body: any = JSON\n',
  'src/any.test.ts': 'export const body: any = JSON\n',
  'src/view.jsx': 'export const view = <p>{undefinedThing}</p>\n',
}

let root
let eslint

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'code-style-')))
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: eslintConfig({ root, ...PATHS }) })
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

/**
 * The messages for one of the files above. A fatal one -- a file the
 * parser could not read, or TypeScript that no program holds -- fails the
 * case, so that none passes on a file nothing linted.
 */
async function lint(path) {
  const [result] = await eslint.lintFiles([join(root, path)])
  const fatal = result.messages.filter((m) => m.fatal)
  expect(fatal, path).toEqual([])
  return result.messages
}

const ruleIds = (messages) => messages.map((m) => m.ruleId)

// The first case to lint a typed file builds the program, of the files
// above alone: 0.35 to 0.41 s with this file run by itself, three times,
// and 0.92 s under `pnpm test:repo` beside every other guard, measured on
// 30 October 2026 on an Apple M2 with 8 cores under Node 22.23.3 -- inside
// vitest's 5 s default, which the cases keep.
describe('the rules', () => {
  // A promise nobody awaits loses its rejection: a file that failed to be
  // written would be reported as written.
  test('a floating promise fails', async () => {
    expect(ruleIds(await lint('src/floating.ts'))).toContain('@typescript-eslint/no-floating-promises')
  })

  // An any from JSON.parse flowing into a typed name is a claim nothing
  // checked; a test may poke at a value it just built, source may not, and
  // a test is relaxed for that alone: its floating promise still fails.
  test('an any from JSON.parse is refused in source and allowed in a test, which is held to the rest', async () => {
    expect(ruleIds(await lint('src/parsed.ts'))).toContain('@typescript-eslint/no-unsafe-assignment')
    const test = ruleIds(await lint('src/parsed.test.ts'))
    expect(test.filter((id) => id?.startsWith('@typescript-eslint/no-unsafe-'))).toEqual([])
    expect(test).toContain('@typescript-eslint/no-floating-promises')
  })

  // A test double that stands in for an async interface must stay async:
  // without the keyword a rejection becomes a synchronous throw, and the
  // code under test meets another failure than the one it will in
  // production. Source that awaits nothing is still a finding.
  test('an async function that awaits nothing is refused in source and allowed in a test', async () => {
    expect(ruleIds(await lint('src/double.ts'))).toContain('@typescript-eslint/require-await')
    expect(ruleIds(await lint('src/double.test.ts'))).not.toContain('@typescript-eslint/require-await')
  })

  // only-throw-error lets a value typed any or unknown be thrown, so a
  // rejection with the same forwarded value (a signal's reason, a driver's
  // rejection) is the same act: the two rules must not disagree, or every
  // such forward needs a disable comment. A known non-Error value, a
  // string literal, is still refused, so a caller cannot be handed a
  // rejection with no stack.
  test('a rejection with a forwarded unknown passes, and one with a string literal still fails', async () => {
    expect(ruleIds(await lint('src/reject-forwarded.ts'))).not.toContain('@typescript-eslint/prefer-promise-reject-errors')
    expect(ruleIds(await lint('src/reject-literal.ts'))).toContain('@typescript-eslint/prefer-promise-reject-errors')
  })

  // A test reads an untyped body on purpose and types it any, for the
  // reason the no-unsafe-* family is relaxed there; source that says any
  // gives up the types its callers rely on, and is still refused.
  test('an explicit any is refused in source and allowed in a test', async () => {
    expect(ruleIds(await lint('src/any.ts'))).toContain('@typescript-eslint/no-explicit-any')
    expect(ruleIds(await lint('src/any.test.ts'))).not.toContain('@typescript-eslint/no-explicit-any')
  })

  // An assertion without its call asserts nothing, and the test that holds
  // it passes whatever the code does; a script's test is no less a test.
  test('an assertion missing its call fails, in TypeScript and JavaScript alike', async () => {
    for (const path of ['src/assertion.test.ts', 'src/assertion.test.mjs']) {
      expect(ruleIds(await lint(path)), path).toContain('@typescript-eslint/no-unused-expressions')
    }
  })

  // Two rules name unused variables; if both ran, one mistake would be two
  // findings, and if neither honoured the underscore a deliberate ignore
  // could not be written -- of an argument, an element of a destructured
  // array or a caught error alike. One rule, typescript-eslint's, in both
  // languages.
  test('a name beginning with _ may go unused, any other may not, in TypeScript and JavaScript alike', async () => {
    for (const path of ['src/unused.ts', 'src/unused.mjs']) {
      const unused = (await lint(path)).filter((m) => /unused-vars/.test(m.ruleId ?? ''))
      const named = unused.map((m) => `${m.ruleId} ${/'([^']+)'/.exec(m.message)?.[1]}`)
      expect(named, path).toEqual(['b', 'second', 'dropped', 'caught'].map((name) => `@typescript-eslint/no-unused-vars ${name}`))
    }
  })

  // A bare disable comment hides a finding without saying why, a stale one
  // keeps hiding whatever lands under it later, and an inline configuration
  // that changes nothing says a rule was turned on that already was.
  test('a disable comment must say why, and one that disables nothing, or a configuration that changes nothing, fails', async () => {
    expect(ruleIds(await lint('src/bare-disable.ts'))).toContain('@eslint-community/eslint-comments/require-description')
    const stale = (path, message) =>
      expect(lint(path)).resolves.toContainEqual(expect.objectContaining({ severity: 2, message: expect.stringMatching(message) }))
    await stale('src/stale-disable.ts', /Unused eslint-disable directive/)
    await stale('src/stale-config.ts', /Unused inline config/)
  })

  // typescript-eslint turns no-undef off for TypeScript, whose compiler
  // holds it; for JavaScript it is what is left to catch a misspelt name in
  // a script before the one run that reaches it fails.
  test("an undefined name in JavaScript fails, and Node's are known", async () => {
    expect(ruleIds(await lint('src/undefined.mjs'))).toContain('no-undef')
    expect(await lint('src/node.mjs')).toEqual([])
  })

  // The four products are written in several languages, whose typography
  // puts narrow spaces in strings and templates; the same character between
  // two tokens of code is an invisible bug.
  test('a typographic space is allowed in a template, and refused between tokens', async () => {
    expect(ruleIds(await lint('src/typography.ts'))).not.toContain('no-irregular-whitespace')
    expect(ruleIds(await lint('src/whitespace.ts'))).toContain('no-irregular-whitespace')
  })
})

describe('the paths a repository passes', () => {
  // A file Prettier formats and ESLint never reads -- a .jsx -- is held to
  // a style and to no rule.
  test('every extension Prettier formats is one ESLint lints, JSX included', async () => {
    for (const extension of EXTENSIONS) {
      expect(await eslint.calculateConfigForFile(join(root, `src/any.${extension}`)), extension).toBeDefined()
    }
    expect(ruleIds(await lint('src/view.jsx'))).toContain('no-undef')
  })

  // TypeScript that no tsconfig holds -- a fixture importing what only
  // another project installs -- is linted without types rather than
  // refused as in no project, or not linted at all.
  test('a file the repository leaves untyped is linted without types', async () => {
    const ids = ruleIds(await lint('untyped/consume.ts'))
    expect(ids).toContain('@typescript-eslint/no-unused-vars')
    expect(ids).not.toContain('@typescript-eslint/no-floating-promises')
  })

  // A browser gate's page.evaluate callbacks run in the page, where
  // document is a name; anywhere else it is a misspelt one.
  test("a file that drives a browser knows the page's globals, and no other does", async () => {
    expect(await lint('page/evaluate.mjs')).toEqual([])
    expect(ruleIds(await lint('src/evaluate.mjs'))).toContain('no-undef')
  })

  // A hook under a condition runs in a different order on another render,
  // and an effect that reads a value it does not depend on keeps the first;
  // outside the React globs the same text is no component, and the plugin
  // is not loaded.
  test('the hooks rules hold where the repository writes React, and nowhere else', async () => {
    const ids = ruleIds(await lint('src/app/hooks.tsx'))
    expect(ids).toContain('react-hooks/rules-of-hooks')
    expect(ids).toContain('react-hooks/exhaustive-deps')
    // The file is linted -- its floating promise is reported -- and has no hooks message.
    const outside = ruleIds(await lint('src/outside.tsx'))
    expect(outside).toContain('@typescript-eslint/no-floating-promises')
    expect(outside.filter((id) => id?.startsWith('react-hooks/'))).toEqual([])
  })

  // A .gitignore in a directory names paths from that directory, as git
  // reads it; read as though it stood at the root, it would ignore a file
  // of that name anywhere. Build output, coverage and test results are
  // never linted, whether or not a .gitignore names them.
  test('each .gitignore is read for its own directory, and build output is ignored besides', async () => {
    expect(await eslint.isPathIgnored(join(root, 'nested/local.ts'))).toBe(true)
    expect(await eslint.isPathIgnored(join(root, 'local.ts'))).toBe(false)
    expect(await eslint.isPathIgnored(join(root, 'build/x.ts'))).toBe(true)
    for (const directory of ['dist', 'coverage', 'test-results']) {
      expect(await eslint.isPathIgnored(join(root, 'src', directory, 'x.ts')), directory).toBe(true)
    }
  })

  // Without the test files every file would be relaxed, and without a
  // tsconfig every TypeScript file refused as in no project: a path left
  // out is refused where the configuration is made.
  test('a path the configuration needs, left out, is refused', () => {
    for (const name of ['project', 'ignoreFiles', 'tests']) {
      expect(() => eslintConfig({ root, ...PATHS, [name]: undefined }), name).toThrow(name)
      expect(() => eslintConfig({ root, ...PATHS, [name]: [] }), name).toThrow(name)
    }
    expect(() => eslintConfig({ ...PATHS, root: 'relative' })).toThrow('root')
  })
})

describe('the format', () => {
  // Two repositories formatted differently would reformat each other's
  // files on every change; everything but these five is Prettier's default.
  test('the style is the five options', async () => {
    expect(prettierConfig).toEqual({ semi: false, singleQuote: true, trailingComma: 'all', printWidth: 160, embeddedLanguageFormatting: 'off' })
    expect(await prettier.format('const a = "x";\n', { ...prettierConfig, parser: 'typescript' })).toBe("const a = 'x'\n")
  })

  // Prettier's default formats code embedded in a string. It reflowed the
  // inline templates of an Angular component, where the whitespace inside
  // an element renders: an option's text " Deutsch " for "Deutsch" failed
  // five tests of formancy.ai's @formancy/angular. A format that changes
  // what a template renders is a behaviour change made as style.
  test('a template embedded in a string is left as it is', async () => {
    const source = ['export const template = /* HTML */ `', '  <select><option>', '      Deutsch', '  </option></select>', '`', ''].join('\n')
    expect(await prettier.format(source, { ...prettierConfig, parser: 'typescript' })).toBe(source)
  })
})
