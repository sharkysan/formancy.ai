// The release's SBOM, checked before anything is published (0187).
//
// Until 0187 the SBOM was cdxgen over the pnpm workspace, and the release's one
// check was that a package URL somewhere in it contained `%40marcbachmann/cel-js`.
// 0.6.0's passed that check. Read from its release page on 2026-10-21, it named
// none of the packages it released, which in the workspace are links; it marked
// Playwright, two TypeScripts, Vite, ng-packagr, Angular's builder and the Testing
// Library packages as required; and it named no tslib, which both Angular packages
// depend on, and fastify without most of what fastify depends on.
//
// The workflow now makes it from the tarballs, installed as a consumer installs
// them, and this refuses one that does not describe them: every package the
// release publishes is named at the release's version, and the SBOM's dependency
// graph gives each one every dependency its manifest declares, at a version the
// SBOM names -- a sibling at the release's own. The CEL evaluator is asked for by
// name as well, because it decides whether a submission is valid, and an SBOM
// without it would be worse than none whatever the manifests say.
//
// Run by `.github/workflows/release.yml` before `pnpm publish -r`; tested by
// `apps/docs/src/sbom.test.ts`.

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { publishable } from './pack.mjs'

/** The expression evaluator, which decides whether a submission is valid. */
export const EVALUATOR = '@marcbachmann/cel-js'

/**
 * A package URL's npm name and version. cdxgen writes a component's with the
 * scope's `@` encoded, `pkg:npm/%40formancy/spec@0.7.0`, and the graph's
 * references with it bare, `pkg:npm/@formancy/spec@0.7.0`: both are
 * `@formancy/spec`, `0.7.0`.
 */
export function npmPurl(purl) {
  const match = /^pkg:npm\/((?:%40|@)?[^@?#]+)@([^?#]+)/.exec(String(purl ?? ''))
  return match === null ? undefined : { name: decodeURIComponent(match[1]), version: decodeURIComponent(match[2]) }
}

/**
 * Every package a release publishes, as `scripts/pack.mjs` finds them, with the
 * names its manifest declares as dependencies. The source manifest, not the one
 * packed: ng-packagr's copy for the Angular packages declares the same names,
 * read from their tarballs on 2026-10-21, and exists only after a build.
 */
export function released() {
  return publishable().map(({ name, dir }) => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return { name, dependencies: Object.keys(manifest.dependencies ?? {}).sort() }
  })
}

/** The SBOM's dependency graph: each package's `name@version` to the packages it depends on. */
function dependencyGraph(sbom) {
  const graph = new Map()
  for (const { ref, dependsOn } of Array.isArray(sbom?.dependencies) ? sbom.dependencies : []) {
    const from = npmPurl(ref)
    if (from !== undefined) graph.set(`${from.name}@${from.version}`, (dependsOn ?? []).map(npmPurl).filter((to) => to !== undefined))
  }
  return graph
}

/**
 * What is wrong with `sbom` as the SBOM of the release at `version` that
 * publishes `packages`, a sentence each.
 */
export function sbomProblems(sbom, { version, packages }) {
  const problems = []
  const named = new Set()
  for (const component of Array.isArray(sbom?.components) ? sbom.components : []) {
    const entry = npmPurl(component?.purl)
    if (entry !== undefined) named.add(`${entry.name}@${entry.version}`)
  }
  const graph = dependencyGraph(sbom)
  if (graph.size === 0) problems.push('the SBOM has no dependency graph, so it gives no published package anything')

  const published = new Set(packages.map(({ name }) => name))
  for (const { name, dependencies } of packages) {
    const self = `${name}@${version}`
    if (!named.has(self)) problems.push(`the SBOM names no ${name} ${version}, which this release publishes`)
    const given = graph.get(self) ?? []
    for (const dependency of dependencies) {
      const edges = given.filter((to) => to.name === dependency)
      if (edges.length === 0) {
        problems.push(`the SBOM records no dependency of ${name} on ${dependency}, which its manifest declares`)
        continue
      }
      for (const to of edges) {
        if (published.has(to.name) && to.version !== version) problems.push(`the SBOM gives ${name} ${to.name} ${to.version}, where this release publishes ${version}`)
        else if (!named.has(`${to.name}@${to.version}`)) problems.push(`the SBOM names no ${to.name} ${to.version}, which it gives ${name}`)
      }
    }
  }

  const evaluated = packages.some(({ name }) => (graph.get(`${name}@${version}`) ?? []).some((to) => to.name === EVALUATOR))
  if (!evaluated) problems.push(`the SBOM gives no published package the CEL evaluator, ${EVALUATOR}, which decides whether a submission is valid`)
  return problems
}

// `node scripts/sbom.mjs formancy-v0.7.0-sbom.cdx.json 0.7.0`
if (basename(process.argv[1] ?? '') === 'sbom.mjs') {
  const [file, version] = process.argv.slice(2)
  if (file === undefined || version === undefined) {
    throw new Error('usage: sbom.mjs <SBOM file> <version>')
  }
  const sbom = JSON.parse(readFileSync(file, 'utf8'))
  const packages = released()
  const problems = sbomProblems(sbom, { version, packages })
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`)
    process.exit(1)
  }
  console.log(`SBOM: ${String(sbom.components.length)} components, naming the ${String(packages.length)} packages this release publishes at ${version}, each given what its manifest declares`)
}
