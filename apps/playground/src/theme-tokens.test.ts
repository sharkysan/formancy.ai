import { afterEach, describe, expect, test } from 'vitest'
import {
  classify,
  declarationsOf,
  describePreset,
  exportCss,
  readPreset,
  rulesOfText,
  themeTokens,
} from './theme-tokens.js'

/**
 * Finding out what a theme can be asked to change.
 *
 * The four shipped themes **do not share a token vocabulary**, and that is
 * deliberate rather than an oversight: they are different design languages
 * rather than palette swaps, which is what falsifies the headless claim
 * ([§8.7](../../../docs/architecture/08-crosscutting-concepts.md)). `blueprint`
 * has `--fm-ink`, `--fm-paper`, `--fm-chrome`, `--fm-rule`; `dusk` has
 * `--fm-ground`, `--fm-raised`, `--fm-inset`, `--fm-edge`; `pop` has
 * `--fm-yellow`, `--fm-pink`, `--fm-lift`. Five names are common to all four.
 *
 * So an editor with a fixed list of controls could not edit them, and giving
 * them one would mean flattening the property that makes them worth shipping.
 * It reads what each theme declares instead — which also means it works for a
 * theme somebody else wrote, with no registration step.
 *
 * **Pure, with the DOM adapter beside it.** These cases hand in rules as data,
 * for the reason `arrange.ts` is DOM-free in the builder: the rule about which
 * declarations count is an argument, and an argument tested through a stylesheet
 * is tested through a CSS parser. `declarationsOf` is the thin adapter over real
 * CSSOM, and the browser gate exercises it against the actual shipped files.
 */
const rule = (selectorText: string, declarations: Array<[string, string]>) => ({
  selectorText,
  declarations,
})
/**
 * A real stylesheet for one block of CSS.
 *
 * Attached to the test document rather than built in a detached one: a document
 * from `createHTMLDocument` has no browsing context, so jsdom never parses a
 * `<style>` in it into CSSOM and `styleSheets` comes back empty -- which is how
 * the first version of these two cases passed nothing to the adapter and
 * asserted that it found nothing in it.
 */
const sheetFor = (css: string): CSSStyleSheet[] => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  attached.push(style)
  return style.sheet === null ? [] : [style.sheet]
}

const attached: HTMLStyleElement[] = []
afterEach(() => {
  while (attached.length > 0) attached.pop()?.remove()
})


describe('which declarations are a theme’s to edit', () => {
  test('the ones on the theme’s own selector, and nothing narrower', () => {
    /*
     * Measured in Chromium before this was written, which is how the rule was
     * found. `blueprint` declares fourteen `--fm-*` properties; two of them are
     * `--fm-columns` and `--fm-datagrid-count`, which are plumbing set on
     * `[data-columns='3']` so a layout can read its own column count. An editor
     * offering those would be offering to break the grid.
     *
     * The discriminator is the shape of the selector rather than a list of names
     * to exclude: a theme-level token is declared on the theme root and a
     * narrower selector is scoped to something. Fifty-eight declarations in the
     * shipped themes are rejected by it.
     */
    const found = themeTokens([
      rule("[data-formancy-theme='blueprint']", [
        ['--fm-ink', '#17222e'],
        ['--fm-radius', '3px'],
      ]),
      rule("[data-formancy-theme='blueprint'] [data-formancy-part='layout-table'][data-columns='3']", [
        ['--fm-columns', '3'],
      ]),
    ])

    expect([...found.keys()]).toEqual(['blueprint'])
    expect(Object.keys(found.get('blueprint') ?? {})).toEqual(['--fm-ink', '--fm-radius'])
  })

  test('and every selector on a rule has to be a theme root, not just one of them', () => {
    // A rule may carry a list. `[data-formancy-theme='a'], .something .narrow`
    // declares the property for both, so taking the first match would attribute
    // a scoped declaration to the theme.
    const found = themeTokens([
      rule("[data-formancy-theme='a'], [data-formancy-theme='a'] [data-formancy-part='field']", [
        ['--fm-ink', '#000'],
      ]),
    ])

    expect(found.size, 'a rule with one narrow selector was treated as theme-level').toBe(0)
  })

  test('and a rule listing two themes gives the token to both', () => {
    // The other direction of the same check, which is why the first one counts
    // matches rather than testing `selectors.length === 1`.
    const found = themeTokens([
      rule("[data-formancy-theme='a'], [data-formancy-theme='b']", [['--fm-step', '1rem']]),
    ])

    expect(found.get('a')).toEqual({ '--fm-step': '1rem' })
    expect(found.get('b')).toEqual({ '--fm-step': '1rem' })
  })

  test('and a later declaration wins, because that is what the cascade does', () => {
    // `dusk` declares `--fm-control` twice. Reading the first would show a value
    // the page is not using, which is worse than showing nothing: the editor
    // would open with a lie in it.
    const found = themeTokens([
      rule("[data-formancy-theme='dusk']", [['--fm-control', '#1b2232']]),
      rule("[data-formancy-theme='dusk']", [['--fm-control', '#11151f']]),
    ])

    expect(found.get('dusk')).toEqual({ '--fm-control': '#11151f' })
  })

  test('and nothing that is not a formancy token', () => {
    // A theme may set anything on its own root. `--brand-x` belongs to whoever
    // wrote it and is not this editor's business to offer.
    const found = themeTokens([
      rule("[data-formancy-theme='a']", [
        ['--fm-ink', '#000'],
        ['--brand-spacing', '4px'],
        ['color', 'red'],
      ]),
    ])

    expect(Object.keys(found.get('a') ?? {})).toEqual(['--fm-ink'])
  })
})

describe('what control a value asks for', () => {
  test('a colour, by the shapes CSS actually writes one in', () => {
    // Four spellings, because a theme that used `rgb()` would otherwise get a
    // text box where every other theme gets a picker.
    for (const value of ['#fff', '#17222e', '#17222eff', 'rgb(23 34 46)', 'oklch(55% 0.1 250)']) {
      expect(classify(value), value).toBe('colour')
    }
  })

  test('a length, with its unit kept', () => {
    for (const value of ['3px', '1.125rem', '2rem', '0.5em', '100%']) {
      expect(classify(value), value).toBe('length')
    }
  })

  test('a bare number, which is not a length and must not gain a unit', () => {
    // `--fm-columns` is a count. Appending `px` to it produces a grid template
    // that silently computes nothing.
    expect(classify('6')).toBe('number')
    expect(classify('1.5')).toBe('number')
  })

  test('and anything else is text, rather than guessed at', () => {
    /*
     * A font stack, a composite shadow, a border shorthand. The editor gives
     * these a text input, which is honest: a `box-shadow` editor is a different
     * product, and a picker that could only express part of the value would
     * destroy the rest of it on first use.
     */
    for (const value of [
      "'IBM Plex Sans', ui-sans-serif, system-ui",
      '2.5px solid var(--fm-ink)',
      '4px 4px 0 var(--fm-ink)',
      'var(--fm-text)',
    ]) {
      expect(classify(value), value).toBe('text')
    }
  })
})

describe('what comes out of it', () => {
  test('a rule for the theme, carrying only what was changed', () => {
    /*
     * Only the overrides. A full dump would be a fork of the theme: paste it
     * into a project and the next release of `@formancy/themes` changes nothing,
     * because every value is pinned. What this emits is a patch that keeps
     * inheriting.
     */
    expect(exportCss('blueprint', { '--fm-signal': '#0b5fce', '--fm-radius': '8px' })).toBe(
      `[data-formancy-theme='blueprint'] {\n  --fm-radius: 8px;\n  --fm-signal: #0b5fce;\n}\n`,
    )
  })

  test('sorted, so the same edits give the same file', () => {
    // A diff that reorders on every save is a diff nobody reads.
    const one = exportCss('a', { '--fm-b': '2px', '--fm-a': '1px' })
    const two = exportCss('a', { '--fm-a': '1px', '--fm-b': '2px' })

    expect(one).toBe(two)
  })

  test('and nothing at all when nothing was changed', () => {
    // An empty rule block is a file somebody commits and then wonders about.
    expect(exportCss('a', {})).toBe('')
  })

  test('and nothing for a token somebody cleared, which is still in the map', () => {
    /*
     * A blank is kept so a field being cleared does not snap back to the theme's
     * value mid-keystroke — see `applied`. The patch has to drop it again, or
     * clearing a control would emit `--fm-ink: ;`, which is a rule the browser
     * discards and a diff the author cannot explain.
     *
     * Added after a mutation run: `exportCss` reading the raw map instead of
     * `applied` left the suite green, because no case had a blank in it.
     */
    expect(exportCss('a', { '--fm-ink': '', '--fm-step': '2rem' })).toBe(
      `[data-formancy-theme='a'] {
  --fm-step: 2rem;
}
`,
    )
    expect(exportCss('a', { '--fm-ink': '   ' })).toBe('')
  })
})

describe('reading real stylesheets', () => {
  test('a cross-origin stylesheet is stepped over rather than thrown on', () => {
    /*
     * The playground loaded two stylesheets whose `cssRules` throw — Google Fonts,
     * cross-origin — until it served its own faces (0154). A host's page that takes
     * its webfont from a font service still does, and an adapter that did not expect
     * that would take the whole editor down, empty on exactly those pages.
     */
    const blocked = {
      get cssRules(): never {
        throw new Error('SecurityError: cannot access rules')
      },
    } as unknown as CSSStyleSheet

    const rules = declarationsOf([blocked, ...sheetFor("[data-formancy-theme='x']{--fm-ink:#111}")])

    expect(rules).toEqual([{ selectorText: "[data-formancy-theme='x']", declarations: [['--fm-ink', '#111']] }])
  })

  test('and a token inside @media is found, because a dark theme declares one there', () => {
    /*
     * Recursed into rather than skipped. No shipped theme wraps its tokens in a
     * media query -- checked, all five -- but a consumer's dark-mode theme would,
     * and an editor that silently showed nothing for it is a worse failure than
     * one that lists a token whose query does not currently match. The value a
     * control opens at comes from `resolve`, not from here, so a non-matching
     * query shows what the page is actually using.
     *
     * `@font-face` and `@import` have no `selectorText` at all, and reading one
     * off them gives `undefined` -- which would match nothing and drop the theme
     * that happened to sit after them.
     */
    const sheets = sheetFor(
      "@media (min-width: 1px) { [data-formancy-theme='x'] { --fm-ink: #111 } }" +
        '@font-face { font-family: X; src: url(x.woff2) }',
    )

    expect(declarationsOf(sheets)).toEqual([
      { selectorText: "[data-formancy-theme='x']", declarations: [['--fm-ink', '#111']] },
    ])
  })
})

describe('a preset read back', () => {
  /** What blueprint declares, as the editor discovers it: the theme a preset is for. */
  const blueprint = { '--fm-ink': '#17222e', '--fm-radius': '3px', '--fm-signal': '#0b5fce' }

  test('is the patch the editor writes, so a file saved from it opens as it was left', () => {
    // The round trip a preset is for. A second format would be a second thing to
    // keep in step with the first, and the patch is already the readable one.
    const saved = exportCss('blueprint', { '--fm-radius': '14px', '--fm-signal': 'oklch(0.6 0.2 250)' })

    expect(readPreset(rulesOfText(saved), 'blueprint', blueprint).overrides).toEqual({
      '--fm-radius': '14px',
      '--fm-signal': 'oklch(0.6 0.2 250)',
    })
  })

  test('and a token the theme does not declare is named, not applied', () => {
    // Applied, it would set a property nothing in the theme reads: the editor would
    // show it as changed and the form would look exactly the same.
    const reading = readPreset(
      rulesOfText("[data-formancy-theme='blueprint'] { --fm-ink: #000; --fm-glow: red }"),
      'blueprint',
      blueprint,
    )

    expect(reading.overrides).toEqual({ '--fm-ink': '#000' })
    expect(reading.undeclared).toEqual(['--fm-glow'])
  })

  test('and a token declared on :root is named, because it would never reach the form', () => {
    // The theme's own root declares the same property, and a declaration on an
    // element beats one it inherits — the commonest way a hand-written override
    // does nothing at all.
    const reading = readPreset(rulesOfText(':root { --fm-ink: #000 }'), 'blueprint', blueprint)

    expect(reading.overrides).toEqual({})
    expect(reading.elsewhere).toEqual([':root'])
  })

  test('and another theme’s tokens stay that theme’s', () => {
    // The four themes share almost no vocabulary on purpose; dusk's --fm-ink is not
    // blueprint's, even where the name is the same.
    const reading = readPreset(
      rulesOfText("[data-formancy-theme='dusk'] { --fm-ink: #000 }"),
      'blueprint',
      blueprint,
    )

    expect(reading.overrides).toEqual({})
    expect(reading.otherThemes).toEqual(['dusk'])
  })

  test('and what was not read is said, so half a preset does not look like all of it', () => {
    const reading = readPreset(
      rulesOfText(
        "[data-formancy-theme='blueprint'] { --fm-ink: #000; --fm-glow: red } :root { --fm-x: 1 } [data-formancy-theme='dusk'] { --fm-edge: #111 }",
      ),
      'blueprint',
      blueprint,
    )

    expect(describePreset('mine.css', 'blueprint', reading)).toBe(
      'Read 1 token for blueprint from mine.css. Not read: --fm-glow, which blueprint does not declare. ' +
        'It also has tokens for dusk: choose that theme and import it again. ' +
        "Not read: what it declares on :root, which is not a theme's own selector and would not reach a themed form.",
    )
    expect(describePreset('empty.css', 'blueprint', readPreset([], 'blueprint', blueprint))).toBe(
      'Nothing in empty.css is a token blueprint declares, so nothing changed.',
    )
  })
})
