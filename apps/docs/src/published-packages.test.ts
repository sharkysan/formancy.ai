import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
 * Both are composition roots with a `main` that listens on something. Nothing
 * imports a server, and requiring one to be imported would mean writing a fake
 * consumer whose only purpose is to satisfy this test — which is the shape of
 * cargo-cult this repository argues against.
 *
 * They are not unverified: `packages/server` has integration tests that build the
 * real app against real PostgreSQL and a signed container image, and
 * `packages/mcp` has its tools driven directly.
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
function importersOf(name: string, own: string): string[] {
  const found = new Set<string>()
  const escaped = name.replace('/', '\\/')
  const needles = [
    // `import { x } from '<name>'`, and `export … from` with it.
    new RegExp(`from\\s+['"]${escaped}(?:/[^'"]*)?['"]`),
    // `import '<name>/blueprint.css'` — for effect, with nothing bound.
    new RegExp(`import\\s+['"]${escaped}(?:/[^'"]*)?['"]`),
    // `@import '<name>/…'`, from a stylesheet.
    new RegExp(`@import\\s+['"]?${escaped}`),
  ]

  const walk = (directory: string, owner: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'out-tsc', '.claude'].includes(entry.name)) continue
        walk(join(directory, entry.name), owner)
        continue
      }
      // CSS counts: a theme's only consumer is a stylesheet or a side-effect
      // import, and leaving it out is half of what made this report a false
      // positive.
      if (!/\.(ts|tsx|mts|css)$/.test(entry.name)) continue
      const text = readFileSync(join(directory, entry.name), 'utf8')
      if (needles.some((needle) => needle.test(text))) found.add(owner)
    }
  }

  for (const group of ['packages', 'apps']) {
    const root = join(repo, group)
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const owner = `${group}/${entry.name}`
      if (owner === own) continue
      walk(join(root, entry.name), owner)
    }
  }
  return [...found].sort()
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
    const excused = new Set(RUN_RATHER_THAN_IMPORTED.map(({ name }) => name))

    const orphaned = publishedPackages()
      .filter(({ name }) => !excused.has(name))
      .filter(({ name, dir }) => importersOf(name, dir).length === 0)
      .map(
        ({ name }) =>
          `${name} is published and nothing imports it by name — so nobody has consumed it the way a user would`,
      )

    expect(orphaned).toEqual([])
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
    // A CSS-only package maps its entries to `.css` files and declares no types,
    // which is the one honest reason to skip attw.
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

  test('and the one package that skips attw really has no types', () => {
    // So the exemption cannot be claimed by a package that grows types later.
    const skipping = publishedPackages()
      .filter(({ manifest }) => !(manifest.scripts?.['check:pkg'] ?? '').includes('attw'))
      .map(({ name, manifest }) => ({ name, types: shipsTypes(manifest) }))

    // A guard on the guard: if this list empties, the assertion below stops
    // asserting anything and the test should go rather than sit here green.
    expect(skipping.map(({ name }) => name)).toEqual(['@formancy/themes'])
    expect(skipping.filter(({ types }) => types)).toEqual([])
  })
})
