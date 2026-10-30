import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import js from '@eslint/js'
import { ESLint, type Linter } from 'eslint'
import * as prettier from 'prettier'
import ts from 'typescript'
import tseslint from 'typescript-eslint'
import { describe, expect, test } from 'vitest'

/**
 * The linter's and the formatter's wiring, as a gate: that every
 * TypeScript and JavaScript file git holds is linted by the shared rules
 * (`@formancy/code-style`, 0225), with the paths `eslint.config.mjs` passes
 * them, and formatted in `prettier.config.mjs`'s style.
 *
 * The rules themselves are the package's, and its own suite holds what each
 * does. What is held here is derived from the files git holds, each known by
 * the language Prettier infers for it, and from the two recommended sets as
 * ESLint itself computes them, never from a list of this file's own: a file
 * added, a rule a set adds, a relaxation or a warning anywhere is seen
 * without an edit here. This file does not import the package: it ships no
 * types, so a TypeScript importer would have to declare its shape a second
 * time, and what it exports is seen from outside instead -- the rules by
 * ESLint's own account of each file, the style by what Prettier resolves.
 *
 * The one case that lints hands ESLint a file's own content and never
 * another text at its path: on Linux, ESLint linted the file on disk
 * instead of the text given (formancy.ai-health CI run 41045406900,
 * 30 October 2026), so a case that edits a repository file's text would
 * pass there having checked nothing.
 *
 * What it cannot see: whether a rule's verdict is right. It holds that a
 * rule runs and fails the build, not that what it reports is a defect.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const eslint = new ESLint({ cwd: root })
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
const scripts = manifest.scripts

/** The messages for a file of the repository, linted with its own content, as `pnpm lint` reads it. */
const lintOwn = (file: string) => eslint.lintText(readFileSync(file, 'utf8'), { filePath: file }).then(([result]) => result?.messages ?? [])

/**
 * What stops ESLint reading a file: a message that no rule gave -- a parsing
 * error for a tsconfig it cannot read or a file in no project, or the warning
 * that the file is ignored. A rule's finding is `pnpm lint`'s and not the
 * wiring's: the findings are fixed in a change of their own, and this case
 * must not wait on them.
 */
const unreadable = (file: string) => lintOwn(file).then((messages) => messages.filter((message) => message.ruleId === null))

/** A package's source, which every rule holds, beside which the install fixtures are read. */
const SOURCE = 'packages/core/src/index.ts'

/** A test, by its name, as the size budget knows one; the capture is the name its source would have. */
const TEST = /\.(test|spec)(\.[cm]?[jt]sx?)$/

/** The install fixtures, which import the packed tarballs and are linted without types. */
const UNTYPED = ['scripts/install-fixture/', 'scripts/angular-install-fixture/']

/** What the shared rules relax in a test, and nothing else. */
const RELAXED_IN_TESTS = [
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/unbound-method',
  '@typescript-eslint/require-await',
]

const HOOKS = ['react-hooks/rules-of-hooks', 'react-hooks/exhaustive-deps']

/** typescript-eslint's rules that read types, as its rules say of themselves. */
const TYPED_RULES = Object.entries((tseslint.plugin as unknown as { rules: Record<string, { meta: { docs?: { requiresTypeChecking?: boolean } } }> }).rules)
  .filter(([, rule]) => rule.meta.docs?.requiresTypeChecking)
  .map(([name]) => `@typescript-eslint/${name}`)

type Entry = Linter.RuleEntry | undefined
type Rules = Partial<Record<string, Entry>>

const severity = (entry: Entry): number | string => {
  const level = Array.isArray(entry) ? entry[0] : entry
  return ({ off: 0, warn: 1, error: 2 } as Record<string, number>)[String(level)] ?? level ?? 0
}
const normal = (entry: Entry) => (entry === undefined ? [0] : [severity(entry), ...(Array.isArray(entry) ? entry.slice(1) : [])])
const atError = (rules: Rules) => Object.keys(rules).filter((rule) => severity(rules[rule]) === 2)
const differing = (a: Rules, b: Rules) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((rule) => !isDeepStrictEqual(normal(a[rule]), normal(b[rule]))).sort()

/** The rules a set of configurations sets for a file at `path`, as ESLint merges them, the sets' own overrides by language included. */
async function rulesOf(configs: Linter.Config[], path: string): Promise<Rules> {
  const reference = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: configs })
  return ((await reference.calculateConfigForFile(join(root, path))) as { rules: Rules }).rules
}

/** What ESLint settles for a file of the repository. */
async function configOf(file: string): Promise<{ rules: Rules; languageOptions: { parserOptions?: { project?: unknown } } }> {
  return (await eslint.calculateConfigForFile(join(root, file))) as Awaited<ReturnType<typeof configOf>>
}

/**
 * Every file git holds that Prettier formats as JavaScript or TypeScript,
 * by the parser it infers -- so a kind of file no list here names is found
 * -- and whether that parser is TypeScript's.
 */
async function trackedSources(): Promise<Array<{ file: string; typescript: boolean }>> {
  const parsers = (await prettier.getSupportInfo()).languages.find((language) => language.name === 'JavaScript')?.parsers ?? []
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean)
  const inferred = await Promise.all(tracked.map((file) => prettier.getFileInfo(join(root, file)).then(({ inferredParser }) => inferredParser)))
  return tracked.flatMap((file, i) => (parsers.includes(inferred[i] ?? '') ? [{ file, typescript: inferred[i] === 'typescript' }] : []))
}

/** The workspace directories whose manifest declares React, each ending in a slash. */
function reactWorkspaces(): string[] {
  return ['packages', 'apps'].flatMap((group) =>
    readdirSync(join(root, group))
      .filter((name) => {
        const path = join(root, group, name, 'package.json')
        if (!existsSync(path)) return false
        const { dependencies, devDependencies, peerDependencies } = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, string> | undefined>
        return [dependencies, devDependencies, peerDependencies].some((declared) => declared?.react !== undefined)
      })
      .map((name) => `${group}/${name}/`),
  )
}

const isUntyped = (file: string) => UNTYPED.some((directory) => file.startsWith(directory))

// The first case to lint a file of a tsconfig builds that tsconfig's
// program, and the tsconfig case builds every package's, every app's and
// the tools'. Measured on 30 October 2026, under Node 22.23.3, with this file
// run alone: 20 s for the whole file. The app's limit (vitest.config.ts) is
// 30 s a case, which a loaded runner could pass on a program's work alone,
// on nothing the case checks, so these cases wait four times that.
const TYPED = { timeout: 120_000 }

describe('the linter', TYPED, () => {
  // A file ESLint never reads, or reads at warn, or with a recommended rule
  // quietly off, passes `pnpm lint` without anyone noticing: a narrowed
  // command, a relaxation added for tests or for everything, a glob that
  // types too little or relaxes too much. So each file git holds is held
  // to what its kind is held to: TypeScript to both recommended sets at
  // error, its typed half off only in the install fixtures, which differ
  // from a package's source by that half and nothing else; JavaScript to
  // the sets' rules that need no types; a test to its source's rules but
  // the seven relaxations; and a file of a workspace that declares React to
  // the hooks rules.
  test('every TypeScript and JavaScript file git holds is linted, by the rules its kind is held to', async () => {
    expect(scripts['lint']).toBe('eslint .')
    const recommended = {
      typescript: atError(await rulesOf([js.configs.recommended, ...tseslint.configs.recommendedTypeChecked], 'reference.ts')),
      javascript: atError(await rulesOf([js.configs.recommended, ...tseslint.configs.recommended], 'reference.mjs')),
    }
    const react = reactWorkspaces()
    const source = (await configOf(SOURCE)).rules
    const problems: string[] = []
    const seen = { source: 0, test: 0, javascript: 0, untyped: 0, react: 0 }
    for (const { file, typescript } of await trackedSources()) {
      if (await eslint.isPathIgnored(join(root, file))) {
        // The generated validator is not source: it is written by
        // packages/spec/scripts/generate-validator.mjs, and ESLint and Prettier
        // both leave it. Nothing else may be ignored.
        if (file !== 'packages/spec/src/generated/document-validator.js') problems.push(`${file}: not linted`)
        continue
      }
      const { rules, languageOptions } = await configOf(file)
      const test = TEST.test(file)
      const untyped = typescript && isUntyped(file)
      const typed = typescript && !untyped
      const off = [...(test ? RELAXED_IN_TESTS : []), ...(typed ? [] : TYPED_RULES)]
      for (const rule of Object.keys(rules).filter((rule) => severity(rules[rule]) === 1)) problems.push(`${file}: ${rule} warns`)
      for (const rule of recommended[typescript ? 'typescript' : 'javascript']) {
        if (!off.includes(rule) && severity(rules[rule]) !== 2) problems.push(`${file}: ${rule} is not at error`)
      }
      for (const rule of off) if (severity(rules[rule]) !== 0) problems.push(`${file}: ${rule} is on`)
      if (Boolean(languageOptions.parserOptions?.project) !== typed) problems.push(`${file}: ${typed ? 'not ' : ''}linted with types`)
      if (test) {
        const its = (await configOf(file.replace(TEST, '$2'))).rules
        const relaxed = RELAXED_IN_TESTS.filter((rule) => severity(its[rule]) !== 0).sort()
        const differ = differing(rules, its)
        if (!isDeepStrictEqual(differ, relaxed)) problems.push(`${file}: differs from its source by ${differ.join(', ') || 'nothing'}`)
      }
      if (untyped) {
        const beyond = differing(rules, source).filter((rule) => !TYPED_RULES.includes(rule))
        if (beyond.length > 0) problems.push(`${file}: differs from ${SOURCE} by ${beyond.join(', ')}`)
      }
      const inReact = typescript && react.some((workspace) => file.startsWith(workspace))
      if (inReact) for (const rule of HOOKS) if (severity(rules[rule]) !== 2) problems.push(`${file}: ${rule} is not at error`)
      seen[test ? 'test' : untyped ? 'untyped' : typescript ? 'source' : 'javascript'] += 1
      if (inReact) seen.react += 1
    }
    expect(problems).toEqual([])
    for (const [kind, count] of Object.entries(seen)) expect(count, `files of the kind ${kind}`).toBeGreaterThan(0)
  })

  // A new package or app must be linted with types without anyone editing
  // the configuration, and a tool config -- a vitest, Vite or tsdown
  // config -- is typed by tsconfig.tools.json, which `project` must name.
  // A tsconfig the parser cannot read is a fatal message, a TypeScript file
  // in no project one too, and a package ESLint ignores a warning that it
  // was ignored, so a file of each that lint passes has no such message.
  test("every package's and app's tsconfig, and the tools', is one lint reads", async () => {
    const firstSource = (directory: string): string | undefined => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          const found = firstSource(path)
          if (found) return found
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) return path
      }
      return undefined
    }
    let checked = 0
    for (const group of ['packages', 'apps']) {
      for (const name of readdirSync(join(root, group))) {
        const directory = join(root, group, name)
        if (!existsSync(join(directory, 'tsconfig.json')) || !existsSync(join(directory, 'src'))) continue
        const file = firstSource(join(directory, 'src'))
        if (!file) continue
        expect(await unreadable(file), file).toEqual([])
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
    const tools = join(root, 'tsconfig.tools.json')
    const { fileNames, errors } = ts.parseJsonConfigFileContent(ts.readConfigFile(tools, ts.sys.readFile).config, ts.sys, root)
    expect(errors).toEqual([])
    expect(fileNames.length, 'files tsconfig.tools.json takes in').toBeGreaterThan(0)
    for (const file of fileNames) expect(await unreadable(file), relative(root, file)).toEqual([])
  })

  // A file TypeScript's wildcard drops is in no program and so is neither
  // type-checked nor linted with types: where two files differ only in
  // their extension, `include` takes the .ts and not the .tsx
  // (formancy.ai-data's apps/host/src/duplicate.test.tsx was found so). So
  // the programs the configuration names are read as TypeScript reads them,
  // and every TypeScript file git holds, the install fixtures aside, must be
  // in one. This is also what holds the Angular packages' specs: each
  // package has a tsconfig.spec.json that `typecheck` does not run, and
  // their *.test.ts are in tsconfig.json's programs, which it does.
  test('every TypeScript file git holds is in a program lint types it with', async () => {
    const { project } = (await configOf(SOURCE)).languageOptions.parserOptions as { project: string[] }
    const tsconfigs = project.flatMap((pattern) => {
      const parts = pattern.replace(/^\.\//, '').split('/')
      return parts
        .reduce(
          (directories, part) =>
            directories.flatMap((directory) =>
              part === '*'
                ? readdirSync(join(root, directory), { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => join(directory, entry.name))
                : [join(directory, part)],
            ),
          ['.'],
        )
        .filter((path) => existsSync(join(root, path)))
    })
    expect(tsconfigs.length, 'tsconfigs the configuration names').toBeGreaterThan(0)
    const placed = new Set(
      tsconfigs.flatMap((tsconfig) => {
        const path = join(root, tsconfig)
        const { fileNames, errors } = ts.parseJsonConfigFileContent(ts.readConfigFile(path, ts.sys.readFile).config, ts.sys, dirname(path))
        expect(errors, tsconfig).toEqual([])
        return fileNames.map((file) => realpathSync(file))
      }),
    )
    const unplaced = (await trackedSources())
      .filter(({ file, typescript }) => typescript && !isUntyped(file))
      .map(({ file }) => file)
      .filter((file) => !placed.has(realpathSync(join(root, file))))
    expect(unplaced).toEqual([])
  })

  // `pnpm lint` is one command over the repository. A package's own `lint`
  // script, or a turbo task for one, would be a second run under other
  // rules, which nothing would compare with the first.
  test('lint is one command at the root, and no package or turbo task runs another', () => {
    const turbo = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf8')) as { tasks: Record<string, unknown> }
    expect(Object.keys(turbo.tasks)).not.toContain('lint')
    const own = ['packages', 'apps'].flatMap((group) =>
      readdirSync(join(root, group)).flatMap((name) => {
        const path = join(root, group, name, 'package.json')
        if (!existsSync(path)) return []
        const { scripts: theirs } = JSON.parse(readFileSync(path, 'utf8')) as { scripts?: Record<string, string> }
        return theirs?.['lint'] === undefined ? [] : [`${group}/${name}`]
      }),
    )
    expect(own).toEqual([])
    expect(scripts['typecheck']).toContain('tsc --noEmit -p tsconfig.tools.json')
  })
})

describe('the formatter', () => {
  // Two repositories formatted differently would reformat each other's
  // files on every change. A .prettierrc in a directory, or an
  // .editorconfig, which Prettier's command line reads, would change the
  // style for the files beneath it. So every file resolves to the
  // configuration at the root, and that is the package's, re-exported.
  test('every TypeScript and JavaScript file git holds is formatted in the shared style', async () => {
    expect(readFileSync(join(root, 'prettier.config.mjs'), 'utf8')).toMatch(/^export \{ prettierConfig as default \} from '@formancy\/code-style'$/m)
    const shared = ((await import(join(root, 'prettier.config.mjs'))) as { default: prettier.Options }).default
    expect(Object.keys(shared).length, 'options the shared style sets').toBeGreaterThan(0)
    const differ: string[] = []
    for (const { file } of await trackedSources()) {
      const options = await prettier.resolveConfig(join(root, file), { editorconfig: true })
      if (!isDeepStrictEqual(options, shared)) differ.push(`${file}: ${JSON.stringify(options)}`)
    }
    expect(differ).toEqual([])
  })

  // A glob that matches nothing fails the check, but a narrowed one passes
  // on the files it still names. So the check, as the script runs it, is run
  // on a misformatted file of every extension git holds, outside the
  // repository, where a run that is killed leaves nothing behind, and must
  // name each. `format` is the check's twin and no other command.
  test('the format scripts check a misformatted file of every extension git holds', async () => {
    expect(scripts['format'], 'format').toBe(scripts['format:check']?.replace('--check', '--write'))
    const extensions = [...new Set((await trackedSources()).map(({ file }) => extname(file)))]
    const [command, ...args] = (scripts['format:check'] ?? '').split(' ').map((word) => word.replace(/^'(.*)'$/, '$1'))
    expect(command).toBe('prettier')
    const prettierRoot = dirname(createRequire(import.meta.url).resolve('prettier/package.json'))
    const bin = join(prettierRoot, (JSON.parse(readFileSync(join(prettierRoot, 'package.json'), 'utf8')) as { bin: string }).bin)
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'format-sample-')))
    try {
      for (const extension of extensions) writeFileSync(join(directory, `sample${extension}`), 'const a = "x";\n')
      const run = spawnSync(process.execPath, [bin, ...args, '--config', join(root, 'prettier.config.mjs')], { cwd: directory, encoding: 'utf8' })
      expect(run.status, run.stderr).toBe(1)
      for (const extension of extensions) expect(run.stdout + run.stderr).toContain(`sample${extension}`)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  // ESLint reads every .gitignore it is handed, each for its own directory;
  // Prettier reads the root's and .prettierignore alone unless a script
  // hands it more with --ignore-path, which replaces those defaults. So both
  // are derived from the .gitignore files git holds: each must be named by
  // the ESLint configuration (as the base path of its ignore patterns, which
  // ESLint's own include helper writes) and by the format scripts' ignore
  // paths, with .prettierignore beside them; and a path each ignores must
  // then be left by ESLint's and Prettier's own APIs. Neither check alone
  // can fail when a nested file only repeats the root's entries, so the
  // wiring is held by name, and the behaviour by the paths.
  test('every .gitignore git holds is read by both tools, and both leave the generated validator', async () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    const ignoreFiles = tracked.filter((file) => file === '.gitignore' || file.endsWith('/.gitignore'))
    expect(ignoreFiles, 'nested ignore files').toContain('apps/docs/.gitignore')
    const configuration = ((await import(join(root, 'eslint.config.mjs'))) as { default: Array<{ name?: string; basePath?: string }> }).default
    const bases = configuration.filter((entry) => entry.name?.startsWith('Imported .gitignore patterns')).map((entry) => realpathSync(entry.basePath ?? ''))
    for (const file of ignoreFiles) expect(bases, `${file} is read by ESLint`).toContain(realpathSync(join(root, dirname(file))))
    const named = (script: string) => (scripts[script] ?? '').split(' ').flatMap((word, i, words) => (words[i - 1] === '--ignore-path' ? [word] : []))
    for (const script of ['format', 'format:check']) {
      expect(named(script).sort(), `${script}'s ignore paths`).toEqual([...ignoreFiles, '.prettierignore'].sort())
    }
    const paths = ignoreFiles.flatMap((file) =>
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'))
        .map((line) => join(dirname(file), line.replace(/^\//, '').replace(/\/$/, '').replaceAll('*', 'x'), 'sample.ts')),
    )
    const generated = 'packages/spec/src/generated/document-validator.js'
    const notIgnored: string[] = []
    for (const path of [...paths, generated]) {
      const git = spawnSync('git', ['check-ignore', '--quiet', path], { cwd: root })
      expect(path === generated || git.status === 0, `${path} is ignored by git`).toBe(true)
      if (!(await eslint.isPathIgnored(join(root, path)))) notIgnored.push(`${path}: linted`)
      const { ignored } = await prettier.getFileInfo(join(root, path), { ignorePath: named('format:check').map((file) => join(root, file)) })
      if (!ignored) notIgnored.push(`${path}: formatted`)
    }
    expect(notIgnored).toEqual([])
    expect(paths.length).toBeGreaterThan(0)
  })
})
