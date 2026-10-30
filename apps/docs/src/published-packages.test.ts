import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

/**
 * Every published package is imported by something, the way a user would import it.
 *
 * **The defect this exists for.** `@formancy/builder-angular` shipped with no
 * `exports` and no `types` in its manifest, so it could not be imported from
 * anywhere — and nothing noticed for four releases
 * ([0096](../../../docs/decisions/0096-two-builders-one-session.md)). Its own
 * ninety-five tests import `./builder` by relative path, which exercises the
 * source and says nothing about the package. `check:pkg` runs `publint` against
 * `dist`, whose manifest ng-packagr generates correctly. The gap sat exactly
 * between those two facts, and only a consumer could fall into it.
 *
 * So: a published package with no workspace consumer importing it **by name** has
 * never been consumed the way a user consumes it. That is the hole, and this is
 * the ratchet over it.
 *
 * It is not a substitute for installing the published tarballs and running them —
 * `docs/architecture/11-risks-and-debt.md` still carries that debt, and it is the
 * only thing that can see bundler and SSR breakage. This is the cheap half that
 * runs on every pull request.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * Published packages that are RUN rather than imported, with the reason.
 *
 * Each is a composition root with a `main`: two listen on something and one is a
 * command. Nothing imports a server or a command, and requiring one to be imported
 * would mean writing a fake consumer whose only purpose is to satisfy this test —
 * which is the shape of cargo-cult this repository argues against.
 *
 * They are not unverified: `packages/server` has integration tests that build the
 * real app against real PostgreSQL and a signed container image, `packages/mcp`
 * has its tools driven directly, and `packages/cli` runs its command in-process
 * and, from the packed tarball, in the install test.
 */
const RUN_RATHER_THAN_IMPORTED: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: '@formancy/server',
    why: 'A Fastify application with a composition root. Exercised by its own integration tests against real PostgreSQL, and by the container image.',
  },
  {
    name: '@formancy/mcp',
    why: 'An MCP server over a running backend. Its tools are driven directly by its own suite; nothing imports a server.',
  },
  {
    name: '@formancy/cli',
    why: 'A command: `formancy types` is run, not imported. Its suite runs the command in-process, and the install test runs the bin from the packed tarball.',
  },
]

/**
 * Published packages whose one consumer is a file outside `packages` and `apps`, each with
 * that file and the reason.
 *
 * The install gate's fixture imports the packed tarballs by name, but it is no workspace
 * consumer. It imports most of the packages, so counting it would excuse each of them the
 * day its last real importer went. A file of it is named here for one package, and holds
 * only while it imports that package and nothing in the workspace does.
 */
const CONSUMED_OUTSIDE_THE_WORKSPACE: ReadonlyArray<{ name: string; file: string; why: string }> = [
  {
    name: '@formancy/code-style',
    file: 'scripts/install-fixture/lint.mjs',
    why: 'A lint configuration: a repository imports it from its eslint.config.mjs, which is no package or app. The install gate imports it by name from the packed tarball and lints a file with it.',
  },
]

/** Every package in `packages/` that `pnpm publish` would push, with its manifest. */
function publishedPackages(): Array<{
  dir: string
  name: string
  manifest: { scripts?: Record<string, string>; types?: unknown; exports?: unknown }
}> {
  const root = join(repo, 'packages')
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = join(root, entry.name, 'package.json')
      let parsed: {
        name?: string
        private?: boolean
        scripts?: Record<string, string>
        types?: unknown
        exports?: unknown
      }
      try {
        parsed = JSON.parse(readFileSync(manifest, 'utf8')) as typeof parsed
      } catch {
        return []
      }
      if (parsed.private === true || parsed.name === undefined) return []
      return [{ dir: `packages/${entry.name}`, name: parsed.name, manifest: parsed }]
    })
}

/**
 * Which workspace packages import `name`, by package name.
 *
 * Source rather than manifests, and that is the point: a dependency declared and
 * never imported proves nothing, and a transitive import compiles just as well as
 * a declared one — the same reasoning `builder-layering.test.ts` gives for
 * reading the source there.
 *
 * A package importing itself does not count, which is what makes a barrel
 * re-exporting its own name invisible here.
 *
 * **Three import shapes, not one.** The first version of this matched
 * `from '<name>'` and reported `@formancy/themes` as consumed by nothing — which
 * was the guard's own regular expression being wrong, the failure this repository
 * has now recorded seven times. A theme is consumed for its *effect*:
 * `import '@formancy/themes/blueprint.css'` has no `from` at all, and a
 * stylesheet reaching one writes `@import`. A guard that knows only the shape it
 * expected reports a false positive on the most ordinary consumer there is.
 */
/**
 * Every source file in `packages` and `apps`, with the package or app it belongs to.
 *
 * Read once rather than once per package asked about: the walk is the cost, and repeating
 * it for every published package took this file past its five seconds under a full
 * parallel run — a guard that times out on the machine running every other test is a
 * guard that gets its timeout raised, and then nobody knows what it costs.
 *
 * CSS counts: a theme's only consumer is a stylesheet or a side-effect import, and
 * leaving it out is half of what made this report a false positive.
 *
 * The install gate's fixture is not walked: see `CONSUMED_OUTSIDE_THE_WORKSPACE`.
 */
let sources: ReadonlyArray<{ owner: string; text: string }> | undefined
function allSources(): ReadonlyArray<{ owner: string; text: string }> {
  if (sources !== undefined) return sources
  const found: Array<{ owner: string; text: string }> = []
  const walk = (directory: string, owner: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'out-tsc', '.claude', 'coverage'].includes(entry.name)) continue
        walk(join(directory, entry.name), owner)
        continue
      }
      if (!/\.(ts|tsx|mts|css)$/.test(entry.name)) continue
      found.push({ owner, text: readFileSync(join(directory, entry.name), 'utf8') })
    }
  }
  for (const group of ['packages', 'apps']) {
    const root = join(repo, group)
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(root, entry.name), `${group}/${entry.name}`)
    }
  }
  sources = found
  return found
}

/** Whether `text` imports `name` by name, in any of the three shapes. */
function importsByName(text: string, name: string): boolean {
  const escaped = name.replace('/', '\\/')
  const needles = [
    // `import { x } from '<name>'`, and `export … from` with it.
    new RegExp(`from\\s+['"]${escaped}(?:/[^'"]*)?['"]`),
    // `import '<name>/blueprint.css'` — for effect, with nothing bound.
    new RegExp(`import\\s+['"]${escaped}(?:/[^'"]*)?['"]`),
    // `@import '<name>/…'`, from a stylesheet.
    new RegExp(`@import\\s+['"]?${escaped}`),
  ]
  return needles.some((needle) => needle.test(text))
}

function importersOf(name: string, own: string): string[] {
  const found = new Set<string>()
  for (const { owner, text } of allSources()) {
    if (owner !== own && importsByName(text, name)) found.add(owner)
  }
  return [...found].sort()
}

/**
 * Of `packages`, those nothing consumes, a sentence each: no workspace package or app
 * imports it, it is not run rather than imported, and no allowance names a file that
 * imports it.
 */
function unconsumed(
  packages: ReadonlyArray<{ name: string; dir: string }>,
  allowances: ReadonlyArray<{ name: string; file: string }> = CONSUMED_OUTSIDE_THE_WORKSPACE,
): string[] {
  const excused = new Set(RUN_RATHER_THAN_IMPORTED.map(({ name }) => name))
  const allowed = (name: string): boolean =>
    allowances.some((allowance) => allowance.name === name && importsByName(readFileSync(join(repo, allowance.file), 'utf8'), name))
  return packages
    .filter(({ name }) => !excused.has(name))
    .filter(({ name, dir }) => importersOf(name, dir).length === 0)
    .filter(({ name }) => !allowed(name))
    .map(({ name }) => `${name} is published and nothing imports it by name — so nobody has consumed it the way a user would`)
}

/** The install gate's fixture, a text per module. */
function fixtureModules(): string[] {
  const directory = join(repo, 'scripts', 'install-fixture')
  return readdirSync(directory)
    .filter((file) => /\.(ts|tsx|mts|mjs)$/.test(file))
    .map((file) => readFileSync(join(directory, file), 'utf8'))
}

describe('what consumes each published package', () => {
  test('is asking about a real list of packages', () => {
    // A guard on the guard: an empty or tiny listing would make the assertions
    // below vacuous, and both of them are about absence.
    const published = publishedPackages()
    expect(published.length).toBeGreaterThan(10)
    expect(published.map(({ name }) => name)).toContain('@formancy/builder-angular')
  })

  test('and finds importers where there obviously are some', () => {
    // The other half of that guard. A regex that matched nothing would report
    // every package as unconsumed, which is a failure, not a pass — but a regex
    // that matched *everything* would report every package as fine, and that is
    // the direction this catches.
    expect(importersOf('@formancy/spec', 'packages/spec').length).toBeGreaterThan(5)
    expect(importersOf('@formancy/nonexistent', 'packages/none')).toEqual([])
    // And the shape that caught this guard out: consumed for its effect, with no
    // `from` anywhere. Named so the pattern cannot narrow back again.
    expect(importersOf('@formancy/themes', 'packages/themes').length).toBeGreaterThan(0)
  })

  test('is something, for every package a user could install', () => {
    expect(unconsumed(publishedPackages())).toEqual([])
  })

  test('and the install gate’s fixture counts as no package’s consumer of its own accord', () => {
    // It imports most of the packages from their tarballs. Were it counted, a package
    // whose last workspace importer went would still be consumed, by the fixture, and
    // this ratchet would hold nothing.
    const counted = publishedPackages().flatMap(({ name, dir }) =>
      importersOf(name, dir)
        .filter((owner) => !/^(?:packages|apps)\//.test(owner))
        .map((owner) => `${name} is counted as consumed by ${owner}`),
    )

    expect(counted).toEqual([])
  })

  test('so a package only the fixture imports is unconsumed, unless an allowance names the file', () => {
    // `@formancy/code-style` is such a package today: nothing in the workspace imports
    // it, and `lint.mjs` does. Without its allowance it is reported; with it, it is not.
    const fixture = fixtureModules()
    const onlyTheFixture = publishedPackages().filter(
      ({ name, dir }) => importersOf(name, dir).length === 0 && fixture.some((text) => importsByName(text, name)),
    )

    expect(onlyTheFixture.map(({ name }) => name)).toEqual(['@formancy/code-style'])
    expect(unconsumed(onlyTheFixture, [])).toEqual([
      '@formancy/code-style is published and nothing imports it by name — so nobody has consumed it the way a user would',
    ])
    expect(unconsumed(onlyTheFixture)).toEqual([])
  })

  test('and every allowance is still true: its file imports the package, and nothing in the workspace does', () => {
    // An allowance whose file stopped importing its package would excuse a package nobody
    // consumes; one whose package acquired a workspace importer is an exemption nobody
    // needs, and comes off as an excuse above does.
    for (const { name, file, why } of CONSUMED_OUTSIDE_THE_WORKSPACE) {
      expect(importsByName(readFileSync(join(repo, file), 'utf8'), name), `${file} does not import ${name}`).toBe(true)
      expect(importersOf(name, `packages/${name.replace('@formancy/', '')}`), name).toEqual([])
      expect(why.length, `${name} is allowed without a reason`).toBeGreaterThan(40)
    }
  })

  test('and every excuse is still true, so the list cannot rot the other way', () => {
    // A package that acquires a consumer should come off this list rather than
    // sit on it granting an exemption nobody needs — the same ratchet the size
    // budget uses.
    const wrong = RUN_RATHER_THAN_IMPORTED.filter(({ name }) => {
      const dir = `packages/${name.replace('@formancy/', '')}`
      return importersOf(name, dir).length > 0
    }).map(({ name }) => `${name} is excused as run-rather-than-imported and something imports it`)

    expect(wrong).toEqual([])
  })

  test('and each excuse says why, because a bare list is a list nobody questions', () => {
    for (const { name, why } of RUN_RATHER_THAN_IMPORTED) {
      expect(why.length, `${name} is excused without a reason`).toBeGreaterThan(40)
    }
  })
})

/**
 * Every published package is checked as a package, to the same standard.
 *
 * Found by counting, which nothing had done: thirteen of fifteen ran
 * `publint && attw`, the two Angular packages ran `publint ./dist` with **no
 * attw at all**, and `@formancy/themes` ran nothing. Three published artefacts on
 * a weaker check than their siblings, for no reason anybody had written down —
 * and `attw` is the tool that answers "do this package's types resolve for a
 * consumer", which is one question away from the defect that started all this.
 *
 * The Angular pair is the interesting case. `attw --pack .` packs the package
 * directory, and `publishConfig.directory: dist` means what ships is `dist`, so
 * the plain invocation would check the wrong tree. Pointed at `./dist` it works
 * and passes — so the weaker check was never a constraint, only an omission.
 */
describe('how each published package is checked as a package', () => {
  /** Whether this package ships anything `attw` could resolve types for. */
  const shipsTypes = (manifest: { types?: unknown; exports?: unknown }): boolean => {
    if (manifest.types !== undefined) return true
    // A package with no types maps its entries straight to files and declares none:
    // `.css` files, or the one JavaScript module `@formancy/code-style` ships, beside
    // which there is no declaration file. That is the one honest reason to skip attw.
    const entries = Object.values((manifest.exports ?? {}) as Record<string, unknown>)
    return entries.some((entry) => typeof entry === 'object' && entry !== null)
  }

  test('is something, for every one of them', () => {
    const unchecked = publishedPackages()
      .filter(({ manifest }) => manifest.scripts?.['check:pkg'] === undefined)
      .map(({ name }) => `${name} is published and has no check:pkg at all`)

    expect(unchecked).toEqual([])
  })

  test('includes publint, which is what reads the manifest a consumer resolves', () => {
    const missing = publishedPackages()
      .filter(({ manifest }) => !(manifest.scripts?.['check:pkg'] ?? '').includes('publint'))
      .map(({ name }) => `${name} does not run publint`)

    expect(missing).toEqual([])
  })

  test('and includes attw wherever there are types to resolve', () => {
    /*
     * The assertion that would have caught the Angular pair. Skipping attw is
     * defensible for a package with no types — and for one WITH them it is the
     * difference between "the manifest looks right" and "a consumer can import
     * this".
     */
    const missing = publishedPackages()
      .filter(({ manifest }) => shipsTypes(manifest))
      .filter(({ manifest }) => !(manifest.scripts?.['check:pkg'] ?? '').includes('attw'))
      .map(({ name }) => `${name} ships types and does not run attw`)

    expect(missing).toEqual([])
  })

  test('and the packages that skip attw really have no types', () => {
    // So the exemption cannot be claimed by a package that grows types later.
    const skipping = publishedPackages()
      .filter(({ manifest }) => !(manifest.scripts?.['check:pkg'] ?? '').includes('attw'))
      .map(({ name, manifest }) => ({ name, types: shipsTypes(manifest) }))

    // A guard on the guard: if this list empties, the assertion below stops
    // asserting anything and the test should go rather than sit here green. Named,
    // so that a third package skipping attw is a decision somebody writes here.
    expect(skipping.map(({ name }) => name)).toEqual(['@formancy/code-style', '@formancy/themes'])
    expect(skipping.filter(({ types }) => types)).toEqual([])
  })
})

/**
 * No package imports itself by its own name.
 *
 * **Why this is a gate and not a style note.** `turbo.json` has `typecheck`
 * depend on `^build` — the builds of a package's *dependencies*, not its own —
 * because a package's own `dist` is output, not input. A module that imports its
 * own package name breaks that: the import resolves through the barrel to
 * `dist/index.d.mts`, so the file's typecheck now needs its own build, which the
 * task graph never promises.
 *
 * Found by running `turbo run typecheck --force`. With a warm cache the dist is
 * already on disk and everything passes; forced, `builder-core:typecheck` raced
 * its own build and tsc reported a `Location`'s members as implicitly `any` —
 * three errors about a type that is declared in the file next door.
 *
 * CI survives it by accident, because `pnpm build` and `pnpm typecheck` are
 * separate steps there. A gate that holds for a reason nobody chose is one line
 * away from not holding, so the one line is what this checks.
 */
describe('what a package imports from itself', () => {
  /** Every workspace package, published or not, with its own name. */
  const workspacePackages = (): Array<{ dir: string; name: string }> =>
    ['packages', 'apps'].flatMap((group) =>
      readdirSync(join(repo, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const file = join(repo, group, entry.name, 'package.json')
          try {
            const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: string }
            if (parsed.name === undefined) return []
            return [{ dir: join(repo, group, entry.name), name: parsed.name }]
          } catch {
            return []
          }
        }),
    )

  /** Files under `dir` that name `self` in an import. */
  const selfImports = (dir: string, self: string): string[] => {
    const found: string[] = []
    // The module specifiers the file actually imports, as TypeScript's own scanner reads
    // them — never text that looks like an import. A regular expression over the source
    // matched the import line `answersTypeScript` writes into a string, and the test
    // expecting it, and reported both as importing their own package. (Before that, the
    // pattern was built in a template literal, where `\s` quietly became `s` and it matched
    // nothing: caught by putting a self-import back and watching the guard stay green.)
    const importsSelf = (text: string): boolean =>
      ts
        .preProcessFile(text, true, true)
        .importedFiles.some(({ fileName }) => fileName === self || fileName.startsWith(`${self}/`))

    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'out-tsc'].includes(entry.name)) continue
          walk(join(at, entry.name))
          continue
        }
        if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue
        const file = join(at, entry.name)
        if (importsSelf(readFileSync(file, 'utf8'))) {
          found.push(file.slice(repo.length + 1).replaceAll('\\', '/'))
        }
      }
    }
    const source = join(dir, 'src')
    // `@formancy/themes` ships stylesheets from its root and has no `src` at
    // all, which is not an error — a package with no TypeScript cannot import
    // anything, let alone itself.
    if (!existsSync(source)) return found
    walk(source)
    return found
  }

  test('is reading a real list of packages', () => {
    // A guard on the guard: the assertion below is about absence, so an empty
    // walk would pass for ever.
    const all = workspacePackages()
    expect(all.length).toBeGreaterThan(15)
    expect(all.map(({ name }) => name)).toContain('@formancy/builder-core')
  })

  test('and the answer is nothing, so no typecheck needs its own build output', () => {
    const offenders = workspacePackages().flatMap(({ dir, name }) =>
      selfImports(dir, name).map(
        (file) =>
          `${file} imports ${name}, its own package — so its typecheck needs this package's own dist, which turbo's \`^build\` does not provide`,
      ),
    )

    expect(offenders).toEqual([])
  })
})

describe('what a manifest says twice', () => {
  /*
   * Found by a mutation that did nothing.
   *
   * A case here was being proved by adding `test:coverage` to
   * `packages/themes/package.json` and watching a Codecov guard fail. It did not
   * fail, and the manifest was the reason: it carried **two** `"scripts"` keys,
   * so JSON kept the last one and `build`, `test` and `typecheck` had been
   * silently dead since a comment was moved out of that block. Nothing broke,
   * because all three were `echo`. The next one would not be.
   *
   * No tool reports this. `JSON.parse` takes the last value without complaint,
   * pnpm and turbo read the parsed object, and a formatter leaves both keys
   * alone -- so the only symptom is a script that does not run, in a repository
   * where several scripts legitimately do nothing.
   *
   * Read from the text rather than the parsed object, necessarily: by the time
   * it is parsed the evidence is gone. Every manifest here is two-space
   * formatted, so a top-level key is a quoted name at exactly that indentation.
   */
  const manifests = (): Array<{ file: string; text: string }> => {
    const out: Array<{ file: string; text: string }> = []
    for (const group of ['packages', 'apps']) {
      for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const file = join(group, entry.name, 'package.json')
        try {
          out.push({ file, text: readFileSync(join(repo, file), 'utf8') })
        } catch {
          continue
        }
      }
    }
    out.push({ file: 'package.json', text: readFileSync(join(repo, 'package.json'), 'utf8') })
    return out
  }

  /** The top-level keys as written, duplicates included. */
  const writtenKeys = (text: string): string[] =>
    [...text.matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1]!)

  test('is read correctly, which is what makes the case below able to fail', () => {
    /*
     * A guard on the guard, and it earns its place: this reads keys with a
     * regular expression over indentation, and six guards in this repository
     * have had their own expression as the defect. If it matched nothing, or
     * matched nested keys as well, the duplicate check would be silent or
     * permanently red.
     *
     * So: what is read is compared against what `JSON.parse` sees. Equal as
     * sets, in order, for every manifest -- which is only true if the expression
     * finds every top-level key and nothing else.
     */
    const all = manifests()
    expect(all.length).toBeGreaterThan(15)

    for (const { file, text } of all) {
      const parsed = Object.keys(JSON.parse(text) as Record<string, unknown>)
      expect([...new Set(writtenKeys(text))], file).toEqual(parsed)
    }
  })

  test('and never declares a key twice, because JSON keeps the last and says nothing', () => {
    for (const { file, text } of manifests()) {
      const keys = writtenKeys(text)
      const twice = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))]

      expect(twice, `${file} declares ${twice.join(', ')} more than once; the earlier one is dead`).toEqual([])
    }
  })
})
