import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The playground's header does not count its own controls.
 *
 * It did. The narrow-screen rule was `repeat(2, minmax(0, 1fr))` with a comment
 * above it saying "the two switchers side by side", both written when there were
 * exactly two — and a third arrived with the demo picker. The grid put it alone
 * on a row of its own with an empty cell beside it: measured at 390×844, the
 * header went from one row of controls to two, 95px to 133px, 16% of the screen
 * before anything a visitor came to see.
 *
 * That is [the rule about counts](../../../CLAUDE.md) in a stylesheet rather than
 * in prose. A number in a template goes stale exactly the way a number in a
 * sentence does, and neither announces it.
 *
 * jsdom has no layout, so this cannot measure the rows — the figures above were
 * taken in a browser by hand. What it can do is fail when the count comes back,
 * which is the thing that caused it.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const css = (): string => readFileSync(join(repo, 'apps', 'playground', 'src', 'app.css'), 'utf8')

/** Every `grid-template-columns` declared for `.controls`, in source order. */
function templatesForControls(): string[] {
  const text = css().replace(/\/\*[\s\S]*?\*\//g, '')
  return [...text.matchAll(/\.controls\s*\{([^}]*)\}/g)]
    .flatMap((rule) => [...(rule[1] ?? '').matchAll(/grid-template-columns\s*:([^;]*)/g)])
    .map((match) => (match[1] ?? '').trim())
}

describe('the playground header', () => {
  test('is reading the stylesheet at all', () => {
    // A guard on the guard: no rule found would make the assertion below
    // vacuously true, and it is an assertion about absence.
    expect(templatesForControls().length).toBeGreaterThan(0)
  })

  test('lays its controls out by what fits, not by how many there are', () => {
    // `repeat(2, …)` is the defect. `auto-fit` is the same rule written so that
    // a fourth control needs no edit here — and a fourth is likely: this row has
    // grown once already.
    for (const template of templatesForControls()) {
      expect(template, template).not.toMatch(/repeat\(\s*\d+/)
      expect(template, template).toMatch(/auto-fit|auto-fill/)
    }
  })

  test('and the app has more controls than the old template allowed for', () => {
    // Derived from the app rather than asserted here: this is what makes the
    // rule above load-bearing rather than tidy. If the picker is ever removed
    // and two are left, the count would fit again and this says so.
    const app = readFileSync(join(repo, 'apps', 'playground', 'src', 'app.tsx'), 'utf8')
    const switchers = [...app.matchAll(/className="switcher"/g)].length

    expect(switchers).toBeGreaterThan(2)
  })
})
