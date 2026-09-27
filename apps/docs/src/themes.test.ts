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

  test('the editor and the read-only rendering space paragraphs the same way', () => {
    // The editing surface is meant to BE the preview, so the two have to agree.
    // Left to the browser they did not agree with anything: every paragraph got
    // `margin: 1em 0`, so three short ones sat 36px apart on a 21px line -- a
    // blank line between each, which reads as double spacing and as though Enter
    // had inserted two newlines. Reported as exactly that.
    const gaps = themes()
      .filter(({ css }) => {
        // One rule has to name both parts, which is what makes them equal by
        // construction rather than by two numbers somebody keeps in step.
        const together = /richtext'\]\s*>\s*\*\s*\+\s*\*\s*,\s*[^{]*richtext-surface'\]\s*>\s*\*\s*\+\s*\*\s*\{/
        return !together.test(css)
      })
      .map(({ name }) => name)

    expect(gaps).toEqual([])
  })

  test('every custom property a theme uses is one that theme defines', () => {
    // The gap that let a broken switch through. The part-name check above passes as
    // soon as a theme MENTIONS a part, and says nothing about whether the
    // declarations resolve -- so a toggle written with blueprint's variables was
    // styled, guarded, green, and invisible in the three themes that do not define
    // `--fm-ink`, `--fm-paper` or `--fm-signal`.
    //
    // A variable that resolves nowhere is not a soft failure in CSS: the declaration
    // is thrown away and the control falls back to whatever it inherited, which for
    // an `appearance: none` input is usually nothing at all -- the same invisible
    // field this file was written for.
    //
    // Each theme is self-contained by design, so the check is per file. A theme
    // layering on top of another would need this relaxed, and would also need to say
    // so somewhere.
    const orphans = themes().flatMap(({ name, css }) => {
      // Only a `var()` with NO fallback. `var(--fm-radius, 0)` is correct by
      // construction -- paper does that deliberately for square corners -- and the
      // first version of this flagged it, which would have made the guard's first
      // finding a false one.
      const used = new Set(
        [...css.matchAll(/var\((--fm-[a-z0-9-]+)\s*\)/g)].map((match) => match[1]),
      )
      const defined = new Set([...css.matchAll(/(--fm-[a-z0-9-]+)\s*:/g)].map((match) => match[1]))
      return [...used]
        .filter((variable) => !defined.has(variable))
        .sort()
        .map((variable) => `${name} uses ${variable} and does not define it`)
    })

    expect(orphans).toEqual([])
  })

  test('resolves every custom property it uses, in the scope that uses it', () => {
    // The hole the check above leaves, found by review rather than by the guard.
    //
    // That one asks whether the file defines a property ANYWHERE, which is not the question
    // CSS asks. `--fm-line-height` was defined on paper's TEXTAREA and used on a typeahead
    // option, which is not a descendant of one -- so the reference resolved to nothing, the
    // declaration was dropped at computed-value time, and the row silently inherited its
    // line height. Scoped exactly like a variable that does not exist, and passing.
    //
    // Real cascade scope needs a parser and a document tree. What is checkable without one
    // is the discipline these themes actually keep: a variable is either defined at the
    // theme root, or defined in the same rule as the use, or the use carries a fallback.
    // A variable deliberately scoped somewhere else is still allowed -- it just has to say
    // so with a fallback, which is what makes the narrower use safe.
    const orphans = themes().flatMap(({ name, css }) => {
      // Comments go first, for two reasons. A comment before a rule lands in the captured
      // selector, which defeated the root test below; and a comment that *mentions* a
      // variable is not a use of one -- the note on paper's typeahead option says
      // `var(--fm-line-height)` in prose precisely to explain why it does not use it.
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      // Innermost rules only, so a nested `@media` yields its rules and not itself.
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      const defined = (body: string): Set<string> =>
        new Set([...body.matchAll(/(--fm-[a-z0-9-]+)\s*:/g)].map((match) => match[1]!))
      // The theme root, and only it: a selector that IS `:root` or `[data-formancy-theme=x]`,
      // or a comma list of those. Asking whether the selector CONTAINS the theme attribute
      // is what made the first version of this check vacuous -- every rule in the file
      // contains it, so paper's textarea counted as the root and the defect passed.
      const ROOT = /^(?::root|\[data-formancy-theme=[^\]]+\])(?:\s*,\s*(?::root|\[data-formancy-theme=[^\]]+\]))*$/
      const atRoot = new Set(
        rules.filter(({ selector }) => ROOT.test(selector)).flatMap(({ body }) => [...defined(body)]),
      )

      return rules.flatMap(({ selector, body }) => {
        const here = defined(body)
        return [...new Set([...body.matchAll(/var\((--fm-[a-z0-9-]+)\s*\)/g)].map((m) => m[1]!))]
          .filter((variable) => !atRoot.has(variable) && !here.has(variable))
          .sort()
          .map(
            (variable) =>
              `${name}: \`${selector}\` uses ${variable} with no fallback, and it is defined neither at the theme root nor on this rule`,
          )
      })
    })

    expect(orphans).toEqual([])
  })

  test('positions the typeahead popup against the control, not against the field', () => {
    // The bug this exists for, reported by somebody looking at the running playground:
    // "das dropdown beim autocomplete klappt komisch auf". The popup opened OVER its own
    // label and box instead of under them.
    //
    // The cause was a CSS rule that is true in one kind of container and false in the
    // other. Every theme lays a field out with `display: grid`. The popup was
    // `position: absolute` with `top` left at `auto`, on the reasoning that it would then
    // take its STATIC position -- where it would have sat in the flow, directly under the
    // box. For an absolutely positioned child of a GRID container the static position is
    // the container's own content-box origin, so `auto` resolved to the top of the field.
    // Measured in the playground: the field's top edge was 457px, an in-flow child would
    // have sat at 537px, and the popup sat at 459px.
    //
    // Nothing could catch that: jsdom has no layout, so no renderer test can see where a
    // box lands, and the four themes each looked reasonable on their own. What IS
    // checkable is the contract that replaced the assumption -- the popup is positioned
    // against an anchor that wraps the control, with an explicit offset -- and that is
    // what this asserts, per theme.
    const OFFSETS = ['top', 'bottom', 'inset-block-start', 'inset-block-end', 'inset-block', 'inset']

    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      const declaring = (part: string, property: RegExp): boolean =>
        rules.some(
          ({ selector, body }) =>
            selector.includes(`[data-formancy-part='${part}']`) &&
            !selector.includes('::') &&
            property.test(body),
        )

      const problems: string[] = []

      // Half one: something establishes a containing block, and it is the anchor.
      if (!declaring('typeahead-anchor', /position:\s*(relative|absolute|sticky)/)) {
        problems.push(`${name}: nothing gives typeahead-anchor a position, so the popup falls back to the field as its containing block`)
      }

      // Half two: the popup says where it goes rather than taking the static position,
      // which is the assumption that was wrong.
      // The declared property names, parsed rather than matched: a regex over the body
      // finds `top` inside `inset-block-start` and inside a value, and getting that
      // wrong is how a guard here passes for the wrong reason.
      const propertiesOf = (body: string): string[] =>
        body
          .split(';')
          .map((declaration) => declaration.split(':')[0]?.trim() ?? '')
          .filter((property) => property !== '')

      const popupOffsets = rules.filter(
        ({ selector, body }) =>
          selector.includes(`[data-formancy-part='typeahead-listbox']`) &&
          propertiesOf(body).some((property) => OFFSETS.includes(property)),
      )
      if (popupOffsets.length === 0) {
        problems.push(`${name}: typeahead-listbox has no explicit block offset, so it takes its static position -- which inside a grid field is the field's own top edge`)
      }

      // Half three: the FIELD must not be the containing block, which is what it was.
      const fieldAnchored = rules.some(
        ({ selector, body }) =>
          /\[data-formancy-part='field'\][^{]*:has\([^)]*typeahead/.test(selector) &&
          /position:\s*(relative|absolute|sticky)/.test(body),
      )
      if (fieldAnchored) {
        problems.push(`${name}: the field is positioned, so it is the popup's containing block again -- that is the arrangement the popup opened over its own label in`)
      }

      return problems
    })

    expect(wrong).toEqual([])
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
