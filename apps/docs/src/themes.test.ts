import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every part the renderers emit is styled by every theme.
 *
 * This is the guard for the bug that prompted it: the rich-text field grew a
 * `richtext-editor` mount point and a `richtext-surface` editing surface, no
 * theme knew either name, and a bare `contenteditable` div has no border, no
 * padding and no height. It rendered as **nothing at all** — a form with an
 * invisible field, reported as "I cannot see the editor", and no test anywhere
 * disagreed.
 *
 * That failure mode is specific to this architecture and worth a guard of its
 * own. The renderers ship no CSS on purpose
 * ([0008](../../../docs/decisions/0008-layered-packages.md)), so a `data-part`
 * hook is the entire contract between a renderer and a theme. A part with no
 * rule is not a styling preference, it is half a feature: the markup exists, the
 * control does not.
 *
 * Derived rather than listed, because a list would have to be updated by the
 * same person who forgot the CSS.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * Parts that are deliberately unstyled, with the reason.
 *
 * A part belongs here when it is a structural wrapper whose children carry the
 * whole appearance. Anything a person is meant to see or operate does not.
 */
const NO_STYLING_NEEDED: Readonly<Record<string, string>> = {
  // A grouping element around the tab list and the panels, both of which are
  // styled by name. The wrapper itself has nothing to draw.
  'layout-tabs': 'a wrapper around layout-tablist and layout-tabpanel',
}

function emittedParts(): string[] {
  const sources = [
    ...readdirSync(join(repo, 'packages', 'react', 'src'))
      .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
      .map((name) => join(repo, 'packages', 'react', 'src', name)),
    ...readdirSync(join(repo, 'packages', 'angular', 'src'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => join(repo, 'packages', 'angular', 'src', name)),
  ].filter((path) => !path.includes('.test.'))

  const parts = new Set<string>()
  for (const path of sources) {
    const text = readFileSync(path, 'utf8')
    // JSX and Angular templates: data-formancy-part="thing"
    for (const match of text.matchAll(/data-formancy-part="([a-z-]+)"/g)) {
      parts.add(match[1]!)
    }
    // Passed as an attribute object: 'data-formancy-part': 'thing'
    for (const match of text.matchAll(/data-formancy-part': '([a-z-]+)'/g)) {
      parts.add(match[1]!)
    }
  }
  return [...parts].sort()
}

/**
 * The stylesheets that dress a FORM.
 *
 * `workbench.css` is in the same package and is not one of them: it dresses the
 * tool — the builder's panes, trees and inspector — and says so in its own first
 * paragraph. Keeping the two apart is deliberate, so that restyling forms cannot
 * restyle the instrument.
 *
 * Told apart by whether the file scopes itself to `data-formancy-theme`, which
 * is what makes a theme selectable, rather than by filename. A new form theme is
 * then covered by this guard the moment it exists, and a second tool stylesheet
 * does not have to be excluded by hand.
 */
function themes(): Array<{ name: string; css: string }> {
  return readdirSync(join(repo, 'packages', 'themes'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({
      name,
      css: readFileSync(join(repo, 'packages', 'themes', name), 'utf8'),
    }))
    .filter(({ css }) => css.includes('data-formancy-theme'))
}

describe('the theme contract', () => {
  test('is actually being read: parts and themes were both found', () => {
    // A guard on the guard. A regex that matched nothing would make everything
    // below pass forever, which is the failure mode of every derived test.
    expect(emittedParts().length).toBeGreaterThan(20)
    expect(themes().length).toBeGreaterThan(2)
  })

  test('every part the renderers emit is styled by every theme', () => {
    const parts = emittedParts().filter((part) => NO_STYLING_NEEDED[part] === undefined)

    const gaps = themes().flatMap(({ name, css }) =>
      parts
        .filter((part) => !css.includes(`part='${part}'`) && !css.includes(`part="${part}"`))
        .map((part) => `${name} does not style ${part}`),
    )

    // The failure this prevents: markup that exists and a control nobody can
    // see. It is not caught by a render test, because the element IS there.
    expect(gaps).toEqual([])
  })

  test('the deliberately-unstyled list is still accurate', () => {
    // An entry that stops being emitted should be removed, or the list becomes
    // a place where exceptions go to be forgotten.
    const parts = new Set(emittedParts())
    const stale = Object.keys(NO_STYLING_NEEDED).filter((part) => !parts.has(part))

    expect(stale).toEqual([])
  })

  test('the rich-text editing surface is styled, not just its wrapper', () => {
    // Named explicitly because it is the case that went wrong, and because the
    // two parts are easy to confuse: the editor library mounts a child inside
    // the mount point, and the CHILD is the box a person sees. Styling only the
    // wrapper looks correct in the CSS and renders an invisible field.
    const gaps = themes()
      .filter(({ css }) => !css.includes("part='richtext-surface'"))
      .map(({ name }) => name)

    expect(gaps).toEqual([])
  })

  test('a themed control has a height, so it is visible before it has content', () => {
    // The specific reason the field was invisible rather than merely unstyled:
    // an empty contenteditable collapses to nothing without one.
    const gaps = themes()
      .filter(({ css }) => {
        const block = /richtext-surface'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
        return !block.includes('min-height')
      })
      .map(({ name }) => name)

    expect(gaps).toEqual([])
  })
})
