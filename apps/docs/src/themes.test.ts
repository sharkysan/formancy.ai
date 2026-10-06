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
  /*
   * **Recursive, and it was not.**
   *
   * This read only the top level of each package's `src`, and every control
   * lives in `src/fields/`. Measured when spec 4 added two: the scan saw **36
   * of 82** parts. The 46 it missed include `label`, `error`, `field`,
   * `required-hint`, and every part of the file field, the rich text editor, the
   * signature, the tag picker and the typeahead.
   *
   * So the guard holding this project's theming contract — "a part with no rule
   * is not a styling preference, it is half a feature" — had been checking 44%
   * of it since the controls were split into their own directory. It passed
   * because it was looking in the wrong place, which is the most expensive way a
   * guard can be green.
   *
   * Fixing the scan turned out to cost almost nothing: all 46 were already
   * styled by hand in all four themes. Only the two new controls' parts were
   * missing, which is the work this change owed anyway.
   */
  const sources: string[] = []
  const walk = (directory: string, extensions: readonly string[]): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path, extensions)
        continue
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue
      if (path.includes('.test.')) continue
      sources.push(path)
    }
  }
  walk(join(repo, 'packages', 'react', 'src'), ['.tsx', '.ts'])
  walk(join(repo, 'packages', 'angular', 'src'), ['.ts'])

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

describe('what a theme must not try to own', () => {
  test('whether a touch drag on the signature surface scrolls the page', () => {
    /*
     * All four themes used to set `touch-action: none` on the signature surface,
     * and that is how a control shipped whose *operability* depended on a
     * stylesheet. Reported from an iPad: the page scrolls while you sign.
     * Measured in Chromium with the theme attribute removed — `auto` on the
     * surface, inside a pane whose overflow is `auto`.
     *
     * Both renderers now declare it on the element
     * ([0101](../../../docs/decisions/0101-a-control-is-operable-without-a-theme.md)),
     * which means a rule here is **dead**: an inline style outranks every author
     * rule. Dead CSS that looks load-bearing is worse than none, because the next
     * person to need it will find it already there and conclude it works.
     *
     * So: not in a theme. A theme owns the height, the border and the cursor.
     */
    for (const { name, css } of themes()) {
      expect(css, `${name} sets touch-action, which the control owns and a stylesheet cannot win`).not.toMatch(
        /touch-action\s*:/,
      )
    }
  })
})

describe('the theme contract', () => {
  test('is actually being read: parts and themes were both found', () => {
    // A guard on the guard. A regex that matched nothing would make everything
    // below pass forever, which is the failure mode of every derived test.
    expect(emittedParts().length).toBeGreaterThan(20)
    expect(themes().length).toBeGreaterThan(2)
  })

  test('and read from every directory, not only the top of each package', () => {
    /*
     * The trap this file fell into, and the one shape of it a mutation cannot
     * catch.
     *
     * `emittedParts()` read only the top level of each renderer's `src`, and
     * every control lives in `src/fields/`. Measured: the scan saw **36 of 82**
     * parts, missing `label`, `error`, `field`, `required-hint`, and every part
     * of the file field, the rich text editor, the signature, the tag picker and
     * the typeahead. The guard holding this project's theming contract had been
     * checking 44% of it.
     *
     * **Reverting the fix leaves the suite green**, which is why a mutation run
     * found nothing: a guard that checks fewer things cannot fail. The only way
     * to hold it is forwards — name parts that exist *only* in a subdirectory and
     * assert the scan finds them. All four of these are emitted from
     * `src/fields/`, and all four were invisible before.
     *
     * Count-free on purpose: 82 is a number that moves on the next control, and
     * a count nobody chose for a reason is a count that passes for the wrong one.
     */
    const parts = emittedParts()

    for (const part of ['label', 'error', 'signature-surface', 'rating-step']) {
      expect(parts, `${part} is emitted from a subdirectory and the scan missed it`).toContain(part)
    }
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

  test('takes the platform look off date and time controls, which iOS draws too wide', () => {
    // Reported from a phone as "the date and time fields are broken on mobile". Mobile
    // Safari gives `date`, `time` and `datetime-local` inputs an intrinsic width that
    // `width: 100%` and `min-width: 0` do not override, so they run past the edge of
    // their field; it centres the value; and an empty one collapses the line its value
    // would sit on. Chromium does none of this -- measured in its phone emulation, all
    // three were exactly as wide as their field in every theme -- so neither this suite
    // nor CI nor a desktop browser can see it.
    //
    // What is checkable is the stylesheet: each theme takes the platform appearance off
    // those three types together, and puts the value back at the start of a line that
    // keeps its height.
    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      const problems: string[] = []

      const controls = rules.find(
        ({ selector }) =>
          ["'date'", "'time'", "'datetime-local'"].every((type) => selector.includes(`[type=${type}]`)) &&
          !selector.includes('::'),
      )
      if (!/(^|[\s;])appearance:\s*none/.test(controls?.body ?? '')) {
        problems.push(`${name}: no rule takes \`appearance\` off date, time and datetime-local inputs together`)
      }
      if (!/-webkit-appearance:\s*none/.test(controls?.body ?? '')) {
        problems.push(`${name}: the date and time rule has no \`-webkit-appearance: none\`, which older iOS needs`)
      }

      const value = rules.find(({ selector }) => selector.includes('::-webkit-date-and-time-value'))
      if (!/text-align:\s*start/.test(value?.body ?? '')) {
        problems.push(`${name}: the date and time value is left centred, which is iOS's default`)
      }
      if (!/min-height:/.test(value?.body ?? '')) {
        problems.push(`${name}: an empty date or time value has no height, so iOS collapses its line`)
      }
      return problems
    })

    expect(wrong).toEqual([])
  })

  test('shows a radio or checkbox state on the next frame, not after the text-field fade', () => {
    // Reported as "in Dusk the radio is not immediate". Every theme gives its text
    // controls a short transition on border, shadow and background, and the checkbox and
    // radio rules inherited it -- they match `input` too. Dusk and Blueprint draw the
    // radio's dot with an inset box-shadow and the fill with a background, so the chosen
    // state itself faded in: measured in Dusk, unchanged for the first frames after the
    // click and settled only after ~150ms, with the whole circle filling with colour
    // before the ring grew back. A choice that answers late reads as a click that did
    // not register.
    //
    // This covers the box or circle itself; the tick and the dot drawn on a
    // pseudo-element are the next test's.
    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      const choice = rules.find(
        ({ selector }) =>
          /input:is\(\[type='checkbox'\],\s*\[type='radio'\]\)$/.test(selector),
      )
      if (choice === undefined) return [`${name}: no rule draws checkboxes and radios together`]
      return /(^|[\s;])transition:\s*none\s*(;|$)/.test(choice.body)
        ? []
        : [`${name}: checkboxes and radios inherit the text controls' transition, so a choice shows late`]
    })

    expect(wrong).toEqual([])
  })

  test('draws a checkbox tick or radio dot at once, not grown in', () => {
    // The follow-up report: "Radio- und Checkbox-Zustand scheint immer noch nicht
    // sofort". The fix above took the text-field fade off the controls, and kept a
    // scale-in on the tick and the dot as an ornament -- 120-140ms in every theme's
    // checkbox and in Pop's and Paper's radio. The tick and the dot ARE the state, so
    // a mark that grows in is a state that arrives late, and it was read that way.
    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      return rules
        .filter(
          ({ selector, body }) =>
            /\[type='(checkbox|radio)'\]/.test(selector) &&
            /::(before|after)/.test(selector) &&
            /(^|[\s;])transition:\s*(?!none\s*(;|$))/.test(body),
        )
        .map(({ selector }) => `${name}: \`${selector}\` animates the mark that shows the choice`)
    })

    expect(wrong).toEqual([])
  })

  test('draws a calendar or a clock in date and time fields on iOS, and only there', () => {
    // Reported from an iPhone: "the date time fields have no icons on safari mobile".
    // Mobile Safari draws none -- the field reads as plain text and the picker opens
    // on a tap -- while Chromium and Firefox draw their own button inside the control.
    // So the icon is the theme's, and it is scoped to iOS: drawn everywhere, Chromium
    // would show two. `@supports (-webkit-touch-callout: none)` is true on iOS WebKit
    // and false in desktop Safari, Chromium and Firefox.
    //
    // Nothing here runs WebKit, so the stylesheet is what is checked: the rules exist
    // inside that query and nowhere else, date and datetime-local get a calendar and
    // time gets a clock, and the icon is drawn in the theme's own muted ink. That last
    // one is derived rather than trusted, because a data URI cannot say
    // `var(--fm-muted)` and a hand-copied colour is exactly what drifts.
    const IOS = /@supports\s*\(\s*-webkit-touch-callout:\s*none\s*\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/

    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rulesOf = (text: string) =>
        [...text.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
          selector: (match[1] ?? '').trim(),
          body: match[2] ?? '',
        }))
      const problems: string[] = []

      const muted = /--fm-muted:\s*(#[0-9a-fA-F]{6})\s*;/.exec(bare)?.[1]?.toLowerCase()
      if (muted === undefined) return [`${name}: defines no six-digit --fm-muted to draw the icon in`]

      const block = IOS.exec(bare)?.[1]
      if (block === undefined) return [`${name}: has no iOS-only block, so date and time fields there have no icon`]

      const icon = (types: string[]) =>
        rulesOf(block).find(
          ({ selector, body }) =>
            types.every((type) => selector.includes(`[type='${type}']`)) &&
            /background-image:\s*url\("data:image\/svg\+xml/.test(body),
        )
      const calendar = icon(['date', 'datetime-local'])
      const clock = icon(['time'])
      if (calendar === undefined) problems.push(`${name}: no calendar for date and datetime-local on iOS`)
      if (clock === undefined) problems.push(`${name}: no clock for time on iOS`)

      for (const rule of [calendar, clock]) {
        if (rule === undefined) continue
        const drawn = /stroke='%23([0-9a-fA-F]{6})'/.exec(rule.body)?.[1]?.toLowerCase()
        if (`#${drawn}` !== muted) {
          problems.push(`${name}: the iOS icon is drawn in #${drawn ?? '?'}, not the theme's --fm-muted ${muted}`)
        }
      }

      // Outside the query nothing may draw one, or Chromium shows its own button and ours.
      const outside = bare.replace(IOS, '')
      const leaked = rulesOf(outside).filter(
        ({ selector, body }) =>
          /\[type='(date|time|datetime-local)'\]/.test(selector) && /background-image:/.test(body),
      )
      if (leaked.length > 0) problems.push(`${name}: a date or time icon is drawn outside iOS, where the browser already draws one`)

      return problems
    })

    expect(wrong).toEqual([])
  })

  test('answers the pointer on a checkbox and a radio, not only on a text field', () => {
    /*
     * Reported from the running page: "the radio button and checkbox is still not
     * visible when clicking or hovering". Measured in Dusk before the fix — hovering an
     * unchecked radio moved its background from `rgb(17, 21, 31)` to `rgb(21, 26, 38)`,
     * a contrast ratio of about 1.03:1 across an 18px circle. Nobody can see that.
     *
     * The cause is that a choice control had no state of its own and fell to the rule
     * every `input` shares: a slightly lighter fill, which is the right answer for a
     * text field two hundred pixels wide and nothing at all for a tick box.
     *
     * So the fill is not enough on its own. A choice control's hover and press have to
     * change its EDGE or draw a ring — something whose size does not depend on the
     * control's. Both states, because the report named both.
     */
    const CHOICE = /input:is\(\[type='checkbox'\], \[type='radio'\]\)/

    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))

      return [':hover', ':active'].flatMap((state) => {
        const answering = rules.filter(
          (rule) => CHOICE.test(rule.selector) && rule.selector.includes(state),
        )
        if (answering.length === 0) {
          return [
            `${name}: a checkbox and a radio have no ${state} of their own, so they fall to the text field's -- a fill change nobody can see on an 18px control`,
          ]
        }

        // The declared property names, parsed rather than matched: `background-color`
        // contains `color`, and a guard that asked for "color" would accept the very
        // rule this exists to refuse.
        const declared = answering.flatMap((rule) =>
          rule.body
            .split(';')
            .map((declaration) => declaration.split(':')[0]?.trim() ?? '')
            .filter((property) => property !== ''),
        )
        const beyondFill = declared.filter((property) => !property.startsWith('background'))

        return beyondFill.length > 0
          ? []
          : [
              `${name}: the ${state} on a checkbox and a radio only changes the fill (${declared.join(', ')}), which is what was already invisible`,
            ]
      })
    })

    expect(wrong).toEqual([])
  })

  test('the pointer cannot un-choose a checkbox or a radio', () => {
    /*
     * The other half of the same report, and the half that was actually visible.
     * Measured in Dusk: a CHOSEN radio sat at `rgb(124, 107, 245)` and turned
     * `rgb(21, 26, 38)` under the pointer — the chosen fill replaced by the text
     * field's hover fill. Click a radio and it lights up, then goes dark again while
     * your pointer is still on it, which is what "not visible when clicking" looked
     * like from the outside.
     *
     * The mechanism is `:is()`. The rule every control shares selects through
     * `:is(input, select, textarea, [data-formancy-part='richtext-surface'])`, whose
     * specificity is the most specific branch — an attribute — and its
     * `:not(:disabled, :focus-visible)` adds another. That is one more than
     * `input:is([type='checkbox'], [type='radio']):checked` can muster, so the hover
     * wins and repaints the chosen state. The focus rule carries no `:not()`, which is
     * exactly why focus was fine and hover was not.
     *
     * So: a rule that reaches a choice control only because it dresses every control
     * may not declare anything the chosen state declares. Derived from the two rule
     * bodies rather than from either one's wording, and by property family, because
     * `background-color` overrides `background` and a string comparison would not say
     * so.
     */
    const NAMES_CHOICE = /\[type='(?:checkbox|radio)'\]/
    const family = (property: string): string => property.split('-')[0] ?? property

    const wrong = themes().flatMap(({ name, css }) => {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((match) => ({
        selector: (match[1] ?? '').trim(),
        body: match[2] ?? '',
      }))
      const families = (of: typeof rules): string[] =>
        of.flatMap((rule) =>
          rule.body
            .split(';')
            .map((declaration) => declaration.split(':')[0]?.trim() ?? '')
            .filter((property) => property !== '')
            .map(family),
        )

      const named = (selector: string): boolean =>
        NAMES_CHOICE.test(selector.replace(/:not\([^)]*\)/g, ''))
      const excluded = (selector: string): boolean =>
        (selector.match(/:not\([^)]*\)/g) ?? []).some((part) => NAMES_CHOICE.test(part))

      const chosen = new Set(
        families(rules.filter((rule) => named(rule.selector) && rule.selector.includes(':checked'))),
      )
      // A guard on the guard: with no chosen state found there is nothing to clash
      // with, and this would pass whatever the hover did.
      if (chosen.size === 0) return [`${name}: no rule paints a chosen checkbox or radio at all`]

      const everyControl = rules.filter(
        (rule) =>
          rule.selector.includes(':hover') &&
          rule.selector.includes(':is(input,') &&
          !named(rule.selector) &&
          !excluded(rule.selector),
      )
      const clashing = [...new Set(families(everyControl))].filter((property) =>
        chosen.has(property),
      )

      return clashing.length === 0
        ? []
        : [
            `${name}: hovering repaints a chosen checkbox or radio (${clashing.join(', ')}), because the rule for every control outranks the chosen one`,
          ]
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
