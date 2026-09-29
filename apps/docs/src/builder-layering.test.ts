import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The builder's core is framework-free, and stays that way.
 *
 * Seven modules — the condition compiler, the two drop models, the two tree
 * flatteners, the palette, and the property list read out of the spec's own JSON
 * Schema — lived in `@formancy/builder-react` because it was the only builder
 * there was. None of them mentioned React. A second builder is what made that
 * expensive rather than merely untidy: an Angular one would either import from
 * the React package, dragging React into an Angular application's dependency
 * closure, or copy them — two compilers turning a condition into CEL, and two
 * answers to where a drop lands.
 *
 * This is [0008](../../../docs/decisions/0008-layered-packages.md)'s rule applied
 * one layer up. The renderers have it enforced by the absence of `@types/node`,
 * which turns a Node import into a compile error. There is no equivalent trick
 * for React — importing it would simply work — so the rule is held here, and it
 * is held against the SOURCE rather than against a manifest, because a transitive
 * import compiles just as well as a declared one.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const sourcesOf = (pkg: string): Array<{ name: string; text: string }> => {
  const directory = join(repo, 'packages', pkg, 'src')
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => ({ name, text: readFileSync(join(directory, name), 'utf8') }))
}

/** Every module specifier a file imports from, comments excluded. */
const importsOf = (text: string): string[] => {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  return [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '')
}

describe('what the builder core may import', () => {
  test('is reading the package at all', () => {
    // A guard on the guard: an empty listing would make every assertion vacuous,
    // and the ones below are all absence.
    const sources = sourcesOf('builder-core')
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.some(({ name }) => name === 'conditions.ts')).toBe(true)
  })

  test('is not React, in any file, however it is spelled', () => {
    const offenders = sourcesOf('builder-core')
      .filter(({ text }) =>
        importsOf(text).some((specifier) => /^react(-dom)?($|\/)|^@formancy\/(react|builder-react)$/.test(specifier)),
      )
      .map(({ name }) => name)

    expect(offenders).toEqual([])
  })

  test('and is not Angular either, which is the same rule seen from the other side', () => {
    // Said explicitly rather than left implied by the React case. The point of
    // moving these was that a builder core belongs to neither framework, and a
    // rule written only against the one that happened to be there first is a rule
    // that permits the second.
    const offenders = sourcesOf('builder-core')
      .filter(({ text }) =>
        importsOf(text).some((specifier) => /^@angular\/|^@formancy\/(angular|builder-angular)$/.test(specifier)),
      )
      .map(({ name }) => name)

    expect(offenders).toEqual([])
  })

  test('and the manifest agrees, so a dependency cannot arrive ahead of an import', () => {
    const manifest = JSON.parse(
      readFileSync(join(repo, 'packages', 'builder-core', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]

    expect(declared.filter((name) => /react|angular/.test(name))).toEqual([])
  })

  test('the modules that moved are exported from it, or nothing gained by moving', () => {
    // The other half. Moved and not exported, they would be unreachable from a
    // second builder — which is the entire reason they moved.
    const barrel = readFileSync(join(repo, 'packages', 'builder-core', 'src', 'index.ts'), 'utf8')
    for (const name of [
      'compileCondition',
      'dropLocation',
      'layoutDropLocation',
      'flatten',
      'flattenLayout',
      'paletteEntries',
      'editablePropertiesFor',
    ]) {
      expect(barrel, `${name} is not exported`).toContain(name)
    }
  })
})
