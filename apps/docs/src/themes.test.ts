import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

  test('lets the narrow-screen reflow win over a column span', () => {
    // The bug this exists for, and I wrote it: a node that spans two columns must stop
    // spanning when the grid collapses to one, or the span creates an IMPLICIT second
    // column and the page scrolls sideways -- the WCAG 1.4.10 reflow the media query
    // exists for, undone by a feature written after it.
    //
    // The reset and the base rule have the same weight, so the cascade decides on
    // ORDER, and the first version of this had the base rule last. Measured in a
    // browser before and after: at 320px a `span 2` cell computed `span 2` with the
    // rules in the wrong order and `auto` with them in the right one.
    //
    // Checked as order rather than as a box, because a box is what jsdom cannot give.
    // `all` is deliberately not covered: `1 / -1` is one column when there is one
    // column, so it needs no reset and keeps its own more specific rule.
    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')

      // Inside a media query and outside one, told apart rather than assumed. The first
      // version of this searched the whole file for the reset, so a `grid-column: auto`
      // written into the BASE rule would have satisfied it -- a guard green over a theme
      // with no narrow-screen behaviour at all, which is the thing it exists to check.
      const queries = [...bare.matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)]
      const narrow = queries.map((match) => match[1] ?? '').join(' ')
      const wide = bare.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')

      // The base rule: `layout-cell` declaring grid-column, at full width.
      const base = wide.search(/\[data-formancy-part='layout-cell'\]\s*\{[^}]*grid-column/)
      // The reset: the same part, back to auto, inside a query.
      const reset = narrow.search(
        /\[data-formancy-part='layout-cell'\]\s*\{[^}]*grid-column:\s*auto/,
      )

      if (queries.length === 0) {
        return [`${name}: has no media query at all, so there is no narrow-screen reflow to win`]
      }
      if (base === -1) return [`${name}: nothing gives layout-cell a grid-column, so a span does nothing`]
      if (reset === -1) {
        return [
          `${name}: nothing resets layout-cell's grid-column at narrow width, so a numeric span survives the collapse to one column and the page scrolls sideways`,
        ]
      }
      // Order, in the file as a whole: the two rules weigh the same, so the cascade
      // decides on which comes last. Measured in `bare` and not across the two extracts
      // above, because a position in one string cannot be compared with a position in
      // another -- which is how a comparison can look like a check and be arithmetic.
      const baseAt = bare.search(/\[data-formancy-part='layout-cell'\]\s*\{[^}]*grid-column:\s*(?!auto)/)
      const resetAt = bare.search(
        /\[data-formancy-part='layout-cell'\]\s*\{[^}]*grid-column:\s*auto/,
      )
      return resetAt > baseAt
        ? []
        : [
            `${name}: the narrow-screen reset for layout-cell comes BEFORE the rule it has to beat. They weigh the same, so the later one wins and the span survives the reflow.`,
          ]
    })

    expect(wrong).toEqual([])
  })

  test('no package below the theme layer ships CSS, in a file or in a decorator', () => {
    /*
     * Two claims meet here and one of them was false.
     *
     * [0008](../../../docs/decisions/0008-layered-packages.md): nothing below the
     * component kit ships a CSS file, because the consumer's design system owns
     * appearance. And the product headline: formancy runs under a strict CSP with no
     * configuration.
     *
     * `@formancy/angular` carried `styles: ':host { display: contents }'` — not a `.css`
     * file, so the first claim's wording did not cover it, and Angular emits a component
     * style as a `<style>` element injected at runtime, which `style-src 'self'` without a
     * nonce blocks. So the second claim was false too, in the one declaration a whole
     * renderer's grid layout depends on
     * ([0079](../../../docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md)).
     *
     * Derived from the tree rather than listed, because a list would be maintained by
     * whoever forgot. A decorator counts as shipping CSS, which is the wording the first
     * version lacked.
     */
    const BELOW_THE_KIT = [
      'core',
      'spec',
      'expressions',
      'react',
      'angular',
      'builder-core',
      'builder-react',
      'server',
      'server-core',
      'conformance',
    ]

    const offenders: string[] = []
    for (const name of BELOW_THE_KIT) {
      const src = join(repo, 'packages', name, 'src')
      if (!existsSync(src)) continue

      const walk = (at: string): void => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
          const full = join(at, entry.name)
          if (entry.isDirectory()) {
            walk(full)
            continue
          }
          if (entry.name.endsWith('.css')) {
            offenders.push(`${name}/${entry.name}: a stylesheet`)
            continue
          }
          if (entry.name.includes('.test.') || !/\.(ts|tsx)$/.test(entry.name)) continue
          const source = readFileSync(full, 'utf8')
          // The decorator property, not the word: a comment explaining why there is no
          // stylesheet must not read as one.
          for (const property of ['styles', 'styleUrls']) {
            if (new RegExp(`^\\s*${property}:`, 'm').test(source)) {
              offenders.push(`${name}/${entry.name}: a component ${property}`)
            }
          }
        }
      }
      walk(src)
    }

    expect(offenders.sort()).toEqual([])
    // A guard on the guard: a wrong path would walk nothing and pass forever.
    expect(existsSync(join(repo, 'packages', 'angular', 'src'))).toBe(true)
  })

  test('scopes every rule to its own theme, so none of them is dead', () => {
    // The bug this exists for, and the guards above all missed it: eight rules per
    // theme were scoped to a placeholder a script had failed to substitute, so the
    // selector matched nothing and `--fm-datagrid-count` was never set anywhere.
    //
    // A datagrid whose author sized no column then fell all the way through to
    // `repeat(1, …)` — ONE content track for a grid the renderer had just declared to
    // have four — with every cell label still clipped, because the media query that
    // un-clips them only applies below 40rem. A column of unlabelled controls.
    //
    // Why the others could not see it: the parts check asks whether a rule NAMES a
    // part, and a dead rule names it. The scope check asks whether a `var(--fm-x)`
    // with no fallback resolves, and this use carries `, 1`. The definition was there,
    // in a rule that could never apply — which is the one shape "is it defined?"
    // cannot distinguish from "does it work?".
    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const scopes = new Set(
        [...bare.matchAll(/\[data-formancy-theme=['"]([^'"\]]+)['"]\]/g)].map((match) => match[1]!),
      )
      // Every theme scopes everything to exactly one name: its own. Which one that is
      // comes from the file rather than from its filename, so a renamed file is not a
      // silent exemption — and more than one name is the defect, whatever they are.
      return scopes.size <= 1
        ? []
        : [`${name} scopes rules to more than one theme: ${[...scopes].sort().join(', ')}`]
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
