import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The admin's room, published once.
 *
 * The dark bench, the glass, the violet and the teal were the `:root` block of
 * `apps/admin/src/admin.css`, and an application's stylesheet is in no package. So
 * formancy.ai-report and formancy.ai-data each copied the block into their own apps by
 * hand, and each wrote a test pinning its copies to the values admin.css had at one
 * commit — a pin that cannot see admin.css move. Now the block is
 * `@formancy/themes/room.css`, the admin imports it like anybody else, and these hold
 * what a copy could not: that it is a palette and nothing more, that it sets every colour
 * of the workbench published beside it, and that the admin keeps no second copy
 * ([0178](../../../docs/decisions/0178-the-rooms-palette-is-published.md)).
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const read = (...path: string[]): string => readFileSync(join(repo, ...path), 'utf8')

/** A stylesheet with its comments gone, so a name in prose is not a declaration. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** Every rule as its selector and its body. A palette has no nesting, so one level is enough. */
const rules = (css: string): Array<{ selector: string; body: string }> =>
  [...withoutComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.trim(),
    body: body!,
  }))

/** A rule body's declarations, by property, each value with its whitespace collapsed. */
const declarations = (body: string): Map<string, string> =>
  new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name!,
      value!.replace(/\s+/g, ' ').trim(),
    ]),
  )

/** The declarations of a stylesheet's first `:root` rule. */
const root = (css: string): Map<string, string> =>
  declarations(rules(css).find(({ selector }) => selector === ':root')?.body ?? '')

const room = (): Map<string, string> => root(read('packages', 'themes', 'room.css'))

/** The custom properties the room declares. */
const palette = (): string[] => [...room().keys()].filter((name) => name.startsWith('--'))

/** Every file under `directory` whose name passes `keep`, as a path from the repository. */
function filesUnder(directory: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(repo, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path, keep)
    return keep(entry.name) ? [path] : []
  })
}

describe("the room's palette", () => {
  test('is a palette: custom properties on :root, the scheme they are drawn for, and nothing else', () => {
    /*
     * Every page that wears the room imports this, pages that put a white sheet in it —
     * the admin's translation preview — among them. A rule for an element, a face loaded or
     * a media query here would change those pages beyond their colours, and nobody
     * importing a palette looks for that. `color-scheme` stays with the colours because it is a fact about
     * them: light text on a dark ground draws native controls and scrollbars dark only if
     * the page says so, and a copy that kept the colours and dropped it would not.
     */
    const css = read('packages', 'themes', 'room.css')

    expect(rules(css).map(({ selector }) => selector)).toEqual([':root'])
    expect(withoutComments(css), 'an at-rule: an @import, an @font-face or a query').not.toContain('@')
    expect(
      [...room().keys()].filter((name) => !name.startsWith('--') && name !== 'color-scheme'),
    ).toEqual([])
    // A guard on the guard: the cases here are about absence, and a parse that read no
    // declaration would satisfy every one of them.
    expect(palette()).toEqual(expect.arrayContaining(['--ground', '--text', '--client', '--server', '--wb-signal']))
  })

  test('holds every value it publishes, so none moves without the changelog saying so', () => {
    /*
     * The room was published so that Formancy Report and Formancy Data import it rather
     * than copy it, and an importer takes a value with the next release it installs, not
     * by reading it here. A grey lightened in this file is then a change on their pages
     * that nobody there made, and the changelog is the only place they would learn of it
     * (0178). Nothing can read whether that line was written; this makes moving a value,
     * or adding or dropping a name, an edit to the map below as well, and its failure
     * says what the edit owes. Compared as written, whitespace collapsed, so a value
     * rewritten in another notation counts as moved: a pin that equated colours could
     * equate the wrong two.
     */
    expect(
      Object.fromEntries(room()),
      'A value in packages/themes/room.css moved, or a name came or went. That is a visible change ' +
        'for every importer, Formancy Report and Formancy Data among them, who get it with their ' +
        'next release of @formancy/themes: say so under Unreleased in CHANGELOG.md, then pin the ' +
        'new map here (0178).',
    ).toEqual({
      '--ground': '#080a12',
      '--glass': 'rgb(17 22 36 / 74%)',
      '--text': '#eef1f8',
      '--muted': '#95a0b4',
      '--edge': 'rgb(255 255 255 / 9%)',
      '--edge-strong': 'rgb(255 255 255 / 15%)',
      '--client': '#8b7bff',
      '--server': '#3fe0d5',
      '--invalid': '#ff7a8a',
      '--ok': '#4fdc8a',
      '--warn': '#ffd27a',
      '--display': "'Archivo', 'Archivo Variable', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
      '--wb-ink': 'var(--text)',
      '--wb-bench': '#0b0f18',
      '--wb-panel': '#0f1422',
      '--wb-surface': '#151b2b',
      '--wb-rule': 'rgb(255 255 255 / 12%)',
      '--wb-muted': 'var(--muted)',
      '--wb-signal': 'var(--client)',
      '--wb-derived': 'var(--server)',
      '--wb-invalid': 'var(--invalid)',
      '--wb-ok': 'var(--ok)',
      '--wb-caution': '#f0b429',
      'color-scheme': 'dark',
    })
  })

  test("sets every colour the workbench declares, and only the workbench's", () => {
    /*
     * The builder's panes take their colours from the workbench's `--wb-*` and from
     * nothing else (0143). A colour the workbench declares and the room leaves unset is
     * drawn in the workbench's light default — a white pane in a dark room, which is how
     * `--wb-caution` would have arrived — and a `--wb-*` the workbench does not declare
     * recolours nothing, a typo that reads as a setting. The workbench's faces are left
     * as it sets them, and are told apart by their value, a stack ending in a generic
     * family, rather than by a list of names.
     */
    const workbench = root(read('packages', 'themes', 'workbench.css'))
    const face = (value: string): boolean => /\b(?:sans-serif|serif|monospace|system-ui)\s*$/.test(value)
    const colours = [...workbench].filter(([name, value]) => name.startsWith('--wb-') && !face(value)).map(([name]) => name)
    const set = palette().filter((name) => name.startsWith('--wb-'))

    expect(colours.length).toBeGreaterThan(5)
    expect({
      unset: colours.filter((name) => !set.includes(name)),
      unknown: set.filter((name) => !workbench.has(name)),
    }).toEqual({ unset: [], unknown: [] })
  })

  test('is declared nowhere in the admin again', () => {
    /*
     * The failure this exists to end, one repository in: a colour moved in the admin's
     * own stylesheet — a grey lightened for a contrast finding — and the room the admin
     * wears no longer the room the package publishes, with every other importer still on
     * the old one. The admin sets none of the palette's names itself, in any rule.
     */
    const palettes = palette()
    const again = filesUnder('apps/admin/src', (name) => name.endsWith('.css')).flatMap((path) =>
      rules(read(path)).flatMap(({ selector, body }) =>
        [...declarations(body).keys()]
          .filter((name) => palettes.includes(name))
          .map((name) => `${path}: ${selector} sets ${name}`),
      ),
    )

    expect(again).toEqual([])
  })

  test('is imported after the workbench, wherever both are', () => {
    /*
     * Both say `:root`, so whichever comes later wins, and the room's `--wb-*` are only
     * a recolouring when they come after the workbench's defaults. Imported first, the
     * admin's panes are the workbench's light ones inside the dark room — and jsdom
     * applies no stylesheet, so no other test here would say so.
     */
    const imported = (source: string, file: string): number => source.indexOf(`'@formancy/themes/${file}'`)
    const importers = filesUnder('apps', (name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))
      .map((path) => ({ path, source: read(path) }))
      .filter(({ source }) => imported(source, 'room.css') >= 0)

    expect(importers.map(({ path }) => path)).toContain('apps/admin/src/app.tsx')
    expect(
      importers
        .filter(({ source }) => imported(source, 'workbench.css') > imported(source, 'room.css'))
        .map(({ path }) => path),
    ).toEqual([])
  })

  test('is named in the themes README, every variable and no other', () => {
    // The names are what an importer writes `var()` around, so they are the package's
    // API: one the README leaves out is one nobody knows they may read.
    const readme = read('packages', 'themes', 'README.md')
    const start = readme.indexOf('## The room')
    const section = readme.slice(start, readme.indexOf('\n## ', start + 1))
    const named = [...new Set([...section.matchAll(/`(--[\w-]+)`/g)].map(([, name]) => name!))].sort()

    expect(start).toBeGreaterThanOrEqual(0)
    expect(named).toEqual(palette().sort())
  })
})
