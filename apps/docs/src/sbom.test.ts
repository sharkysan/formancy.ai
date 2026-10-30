import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { EVALUATOR, released, sbomProblems } from '../../../scripts/sbom.mjs'

/**
 * The release's SBOM is checked before anything is published
 * ([0187](../../../docs/decisions/0187-the-sbom-describes-what-a-consumer-installs.md)).
 *
 * Until 0187 the SBOM was cdxgen over the pnpm workspace, and the release's one check
 * was that a package URL somewhere in it contained `%40marcbachmann/cel-js`. 0.6.0's,
 * read from its release page on 2026-10-21, passed that check and named none of the
 * packages it released, marked Playwright, TypeScript and Vite as required, and named
 * no tslib, which both Angular packages depend on. The release workflow now makes it
 * from the tarballs, installed as a consumer installs them (`release-image.test.ts`
 * holds that), and `scripts/sbom.mjs` refuses one that does not describe them.
 *
 * The SBOMs here are shaped as cdxgen 12.8.4 wrote one on 2026-10-21: a component's
 * package URL with its scope's `@` encoded, `pkg:npm/%40formancy/core@0.7.0`, and the
 * dependency graph's references with it bare, `pkg:npm/@formancy/core@0.7.0`. A reader
 * that knew one spelling would find nothing in the other half and refuse every SBOM, or
 * with a careless fallback, accept every one.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const VERSION = '0.7.0'

/** Three packages of a release, each with what its manifest declares. */
const PACKAGES = [
  { name: '@formancy/spec', dependencies: ['ajv'] },
  { name: '@formancy/expressions', dependencies: [EVALUATOR] },
  { name: '@formancy/core', dependencies: ['@formancy/expressions', '@formancy/spec'] },
]

const component = (name: string, version: string) => ({
  name: name.split('/').at(-1),
  version,
  purl: `pkg:npm/${name.replace(/^@/, '%40')}@${version}`,
})
const ref = (name: string, version: string) => `pkg:npm/${name}@${version}`

/** The SBOM cdxgen writes for those three, installed as a consumer installs them. */
function cdxgen() {
  return {
    bomFormat: 'CycloneDX',
    components: [
      component('@formancy/spec', VERSION),
      component('@formancy/expressions', VERSION),
      component('@formancy/core', VERSION),
      component('ajv', '8.20.0'),
      component(EVALUATOR, '8.0.0'),
      component('fast-deep-equal', '3.1.3'),
    ],
    dependencies: [
      { ref: ref('formancy', VERSION), dependsOn: PACKAGES.map(({ name }) => ref(name, VERSION)) },
      { ref: ref('@formancy/spec', VERSION), dependsOn: [ref('ajv', '8.20.0')] },
      { ref: ref('@formancy/expressions', VERSION), dependsOn: [ref(EVALUATOR, '8.0.0')] },
      {
        ref: ref('@formancy/core', VERSION),
        dependsOn: [ref('@formancy/expressions', VERSION), ref('@formancy/spec', VERSION)],
      },
      { ref: ref('ajv', '8.20.0'), dependsOn: [ref('fast-deep-equal', '3.1.3')] },
    ],
  }
}

type Sbom = ReturnType<typeof cdxgen>

const problems = (sbom: unknown, packages = PACKAGES) => sbomProblems(sbom, { version: VERSION, packages })

const without = (sbom: Sbom, purl: string): Sbom => ({
  ...sbom,
  components: sbom.components.filter((entry) => entry.purl !== purl),
})

const dropEdge = (sbom: Sbom, from: string, to: string): Sbom => ({
  ...sbom,
  dependencies: sbom.dependencies.map((entry) => (entry.ref === from ? { ...entry, dependsOn: entry.dependsOn.filter((target) => target !== to) } : entry)),
})

describe('the SBOM check', () => {
  test('accepts the SBOM of a release as cdxgen writes one', () => {
    // A guard on the guards below: a check that refused every SBOM would pass each of
    // them, and stop every release instead of the wrong ones.
    expect(problems(cdxgen())).toEqual([])
  })

  test("refuses an SBOM that does not name a published package at the release's version", () => {
    // cdxgen over the workspace named none of them, because there they are links and not
    // packages: 0.6.0's SBOM named no `@formancy` package at all.
    const missing = problems(without(cdxgen(), 'pkg:npm/%40formancy/core@0.7.0'))
    expect(missing).toContain('the SBOM names no @formancy/core 0.7.0, which this release publishes')

    // Nor one naming it at another version, as an install that fetched the last release
    // from the registry instead of this one's tarball would.
    const stale = cdxgen()
    stale.components = stale.components.map((entry) => (entry.purl === 'pkg:npm/%40formancy/core@0.7.0' ? component('@formancy/core', '0.6.0') : entry))
    expect(problems(stale)).toContain('the SBOM names no @formancy/core 0.7.0, which this release publishes')
  })

  test('refuses an SBOM that names the evaluator without giving it to the package that declares it', () => {
    // The old check: `@marcbachmann/cel-js` somewhere among the package URLs. Named only
    // as some other tree's dependency, it passed, while saying nothing about what
    // `@formancy/expressions` brings.
    const sbom = dropEdge(cdxgen(), ref('@formancy/expressions', VERSION), ref(EVALUATOR, '8.0.0'))
    expect(sbom.components.map((entry) => entry.purl)).toContain('pkg:npm/%40marcbachmann/cel-js@8.0.0')

    const found = problems(sbom)
    expect(found).toContain('the SBOM records no dependency of @formancy/expressions on @marcbachmann/cel-js, which its manifest declares')
    expect(found).toContain('the SBOM gives no published package the CEL evaluator, @marcbachmann/cel-js, which decides whether a submission is valid')
  })

  test('refuses an SBOM that leaves out a dependency a published package declares', () => {
    // tslib, which both Angular packages depend on, was missing from 0.6.0's SBOM, and most
    // of what fastify, which the server depends on, depends on in turn.
    const sbom = dropEdge(cdxgen(), ref('@formancy/spec', VERSION), ref('ajv', '8.20.0'))
    expect(problems(sbom)).toEqual(['the SBOM records no dependency of @formancy/spec on ajv, which its manifest declares'])
  })

  test('refuses an SBOM that gives a published package a dependency it does not name', () => {
    // An edge to a component the SBOM leaves out is a dependency nobody reading the
    // component list will find.
    expect(problems(without(cdxgen(), 'pkg:npm/ajv@8.20.0'))).toEqual(['the SBOM names no ajv 8.20.0, which it gives @formancy/spec'])
  })

  test('refuses an SBOM that gives a published package another release of a sibling', () => {
    // Every package moves on one version, so any two at one version are known to work
    // together; a consumer handed 0.6.0's spec under 0.7.0's core has a pair nothing
    // tested.
    const sbom = cdxgen()
    sbom.components.push(component('@formancy/spec', '0.6.0'))
    sbom.dependencies = sbom.dependencies.map((entry) =>
      entry.ref === ref('@formancy/core', VERSION) ? { ...entry, dependsOn: [ref('@formancy/expressions', VERSION), ref('@formancy/spec', '0.6.0')] } : entry,
    )
    expect(problems(sbom)).toEqual(['the SBOM gives @formancy/core @formancy/spec 0.6.0, where this release publishes 0.7.0'])
  })

  test('refuses an SBOM without a dependency graph, rather than finding nothing wrong in it', () => {
    // A cdxgen that stopped writing the graph, or wrote references that are not package
    // URLs, would give no package anything. That is a refusal, never a pass.
    const { dependencies: _graph, ...bare } = cdxgen()
    expect(problems(bare)).toContain('the SBOM has no dependency graph, so it gives no published package anything')

    const unreadable = cdxgen()
    unreadable.dependencies = unreadable.dependencies.map((entry, index) => ({ ...entry, ref: `ref-${String(index)}` }))
    expect(problems(unreadable)).toContain('the SBOM has no dependency graph, so it gives no published package anything')

    expect(problems(undefined).length).toBeGreaterThan(0)
  })

  test('refuses an SBOM without the evaluator even when no manifest asks for it', () => {
    // What a submission is checked by is not left to whatever the manifests say today:
    // were `@formancy/expressions` to stop declaring it, every check above would pass an
    // SBOM without it, and this one says so.
    const declared = PACKAGES.map((entry) => (entry.name === '@formancy/expressions' ? { ...entry, dependencies: [] } : entry))
    const sbom = without(dropEdge(cdxgen(), ref('@formancy/expressions', VERSION), ref(EVALUATOR, '8.0.0')), 'pkg:npm/%40marcbachmann/cel-js@8.0.0')
    expect(problems(sbom, declared)).toEqual([
      'the SBOM gives no published package the CEL evaluator, @marcbachmann/cel-js, which decides whether a submission is valid',
    ])
  })
})

/**
 * Every project under `pnpm-workspace.yaml`'s globs that is not private, which is what
 * `pnpm publish -r` publishes. Only the `<directory>/*` shape is read, and anything
 * else throws rather than being read as nothing.
 */
function publishedByPnpm(): string[] {
  const lines = readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8').split('\n')
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (start === -1) throw new Error('pnpm-workspace.yaml names no packages')
  const globs: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const entry = /^\s+-\s*["']?([^"'\s]+)["']?\s*$/.exec(line)
    if (entry !== null) globs.push(entry[1]!)
  }
  if (globs.length === 0) throw new Error('pnpm-workspace.yaml names no package globs')

  const projects = ['.']
  for (const glob of globs) {
    const directory = /^([\w.-]+)\/\*$/.exec(glob)?.[1]
    if (directory === undefined) throw new Error(`this reads <directory>/* globs only, not ${glob}`)
    for (const entry of readdirSync(join(repo, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) projects.push(join(directory, entry.name))
    }
  }
  return projects
    .map((project) => join(repo, project, 'package.json'))
    .filter((manifest) => existsSync(manifest))
    .map((manifest) => JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; private?: boolean })
    .filter((manifest) => manifest.private !== true && manifest.name !== undefined)
    .map((manifest) => manifest.name!)
}

describe('what the check expects', () => {
  test('is every package `pnpm publish -r` publishes, and nothing else', () => {
    // The release packs its SBOM's tarballs with `scripts/pack.mjs`, and the check
    // expects what that names, so a package it missed would be missing from both and
    // pass. pnpm's own `pnpm -r pack` was no answer: on 2026-10-21 it packed the private
    // apps and the workspace root as well.
    const expected = publishedByPnpm()
    expect(expected.length).toBeGreaterThan(10)
    expect(
      released()
        .map(({ name }) => name)
        .sort(),
    ).toEqual(expected.sort())
  })

  test('reads what each package declares, the evaluator and tslib among them', () => {
    // A reader that found no dependencies would ask nothing of the graph, and every
    // SBOM that named the packages would pass.
    const declared = new Map(released().map(({ name, dependencies }) => [name, dependencies]))
    expect(declared.get('@formancy/expressions')).toContain(EVALUATOR)
    expect(declared.get('@formancy/angular')).toContain('tslib')
    expect(declared.get('@formancy/server')).toContain('fastify')
  })
})
