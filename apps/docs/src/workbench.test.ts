import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every part a builder draws is dressed by the workbench.
 *
 * Asked: the playground's prompt pane "is really ugly". Measured, it was a textarea at the
 * browser's default size in the browser's default monospace, pale grey on a dark bench,
 * beside a grey native button — because nothing styled it. `workbench.css` dressed the
 * tree, the palettes and the inspector it was written for, and the parts that arrived after
 * it — describing a change in words, the scenarios, blocks, translations, a datagrid's
 * columns, a group inside a condition — had no rule anywhere except the admin's own
 * stylesheet, which dressed the translations for the admin and nobody else.
 *
 * Derived from the two builders' sources, so a part either one gains is in this list the
 * day it is written, and fails here until the workbench says how it looks.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** `source` with every span from `open` to the next `close` taken out. */
function without(source: string, open: string, close: string): string {
  let kept = ''
  let at = 0
  for (;;) {
    const start = source.indexOf(open, at)
    if (start < 0) return kept + source.slice(at)
    kept += source.slice(at, start)
    const end = source.indexOf(close, start + open.length)
    if (end < 0) return kept
    at = end + close.length
  }
}

/**
 * Comments out, in every syntax a builder source holds: a part named in prose is not drawn.
 *
 * Scanned rather than replaced by a regular expression, which CodeQL reads as an HTML
 * sanitiser that a nested comment can defeat. This is reading source, not cleaning markup
 * for a browser, and a scan says so without a loop to placate the query.
 */
const code = (source: string): string =>
  without(without(source, '<!--', '-->'), '/*', '*/').replace(/^\s*\/\/.*$/gm, '')

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) return []
    return [readFileSync(path, 'utf8')]
  })
}

/**
 * The parts a builder emits, in both spellings it uses: the literal attribute, and
 * Angular's bound one, whose expression names the part in quotes —
 * `[attr.data-formancy-part]="enabled() ? 'arrange-surface' : null"`.
 */
function emitted(): string[] {
  const parts = new Set<string>()
  for (const pkg of ['builder-react', 'builder-angular']) {
    for (const source of sources(join(repo, 'packages', pkg, 'src')).map(code)) {
      for (const [, part] of source.matchAll(/data-formancy-part="([a-z-]+)"/g)) parts.add(part!)
      for (const [, bound] of source.matchAll(/\[attr\.data-formancy-part\]="([^"]*)"/g)) {
        for (const [, part] of bound!.matchAll(/'([a-z-]+)'/g)) parts.add(part!)
      }
    }
  }
  return [...parts].sort()
}

/** The parts a rule in the workbench selects, by any attribute operator and either quote. */
function dressed(): Set<string> {
  const css = code(readFileSync(join(repo, 'packages', 'themes', 'workbench.css'), 'utf8'))
  return new Set(
    [...css.matchAll(/data-formancy-part\s*[~|^$*]?=\s*['"]([a-z-]+)['"]/g)].map(([, part]) => part!),
  )
}

describe('the workbench', () => {
  test('is reading the builders at all', () => {
    // A walk that found nothing would pass the case below with an empty list.
    expect(emitted()).toEqual(expect.arrayContaining(['builder-tree', 'property-panel', 'prompt-pane']))
  })

  test('dresses every part either builder draws', () => {
    const missing = emitted().filter((part) => !dressed().has(part))
    expect(missing).toEqual([])
  })

  test('and the themes README names every token an application sets, and no other', () => {
    // How an application changes the builders' look is the tokens, so a token the README
    // leaves out is one nobody knows to set — `--wb-caution` arrived with this test.
    const css = code(readFileSync(join(repo, 'packages', 'themes', 'workbench.css'), 'utf8'))
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const declared = [...root.matchAll(/(--wb-[a-z-]+)\s*:/g)].map(([, token]) => token!).sort()
    const readme = readFileSync(join(repo, 'packages', 'themes', 'README.md'), 'utf8')
    const section = readme.slice(readme.indexOf('## The builders'), readme.indexOf('## Right to left'))
    const named = [...new Set([...section.matchAll(/`(--wb-[a-z-]+)`/g)].map(([, token]) => token!))].sort()

    expect(declared.length).toBeGreaterThan(5)
    expect(named).toEqual(declared)
  })
})
