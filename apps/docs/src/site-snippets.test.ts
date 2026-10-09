import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { EDITOR, INSTALL } from '../../site/src/angular-snippets.js'

/**
 * The code the Angular page writes by hand, held to the packages it names.
 *
 * An install command and a component snippet go stale silently: a package renamed or made
 * private, an export moved, and the page goes on showing code that fails for everybody who
 * copies it. Here rather than beside the page because the page's app has no Node types on
 * purpose ([0008](../../../docs/decisions/0008-layered-packages.md)), and this needs the
 * repository.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** Every package in the workspace, by name: its directory and whether it is published. */
const packages = new Map(
  readdirSync(join(repo, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const manifest = JSON.parse(
          readFileSync(join(repo, 'packages', entry.name, 'package.json'), 'utf8'),
        ) as { name?: string; private?: boolean }
        return manifest.name === undefined
          ? []
          : [[manifest.name, { dir: entry.name, published: manifest.private !== true }] as const]
      } catch {
        return []
      }
    }),
)

/**
 * The names a package's entry exports, read by the compiler rather than by a pattern: this
 * codebase writes no semicolons, so a pattern from `export` to a name runs across every
 * export block in the file and finds any name at all.
 */
function exportsOf(name: string): Set<string> {
  const found = packages.get(name)
  if (found === undefined) throw new Error(`No package called ${name} in the workspace.`)
  const file = join(repo, 'packages', found.dir, 'src', 'index.ts')
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
  const names = new Set<string>()
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) names.add(element.name.text)
    }
  }
  return names
}

/** `import { A, B } from '@formancy/x'` in a snippet, as `[name, package]` pairs. */
function formancyImports(snippet: string): Array<[string, string]> {
  return [...snippet.matchAll(/import \{([^}]*)\} from '(@formancy\/[^']+)'/g)].flatMap(
    ([, names, from]) =>
      (names ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
        .map((name): [string, string] => [name, from ?? '']),
  )
}

describe('the Angular page’s snippets', () => {
  test('install only packages that exist and are published', () => {
    const named = INSTALL.split(/\s+/).filter((word) => word.startsWith('@formancy/'))

    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(packages.get(name)?.published, name).toBe(true)
  })

  test('and import only what those packages export, from packages the command installs', () => {
    const imports = formancyImports(EDITOR)

    expect(imports.map(([name]) => name)).toContain('FormancyBuilder')
    for (const [name, from] of imports) {
      expect(INSTALL.split(/\s+/), `${from} is imported but not installed`).toContain(from)
      expect(exportsOf(from).has(name), `${from} does not export ${name}`).toBe(true)
    }
  })
})
